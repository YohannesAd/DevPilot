"""Issue API, ownership, persistence and migration checks on isolated PostgreSQL."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from secrets import token_urlsafe
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.main import app
from app.models import Issue, Project, UserSession
from app.security import SESSION_COOKIE


@pytest.fixture
def workspace(client):
    credentials = {"email": "issue-owner@example.com", "password": token_urlsafe(24)}
    assert client.post("/api/auth/register", json={**credentials, "display_name": "Issue Owner"}).status_code == 201
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    project = client.post("/api/projects", json={"name": "Issue project", "description": "Keep project data"}).json()
    return credentials, project, f"/api/projects/{project['id']}/issues"


def test_create_defaults_update_clear_and_persist(client, workspace, clean_database):
    credentials, project, path = workspace
    assert client.get(path).json() == {"items": [], "has_more": False}
    response = client.post(path, json={"title": "  First task  ", "description": "  Plain text\nSecond line  "})
    assert response.status_code == 201
    saved = response.json()
    assert set(saved) == {"id", "project_id", "title", "description", "type", "status", "priority", "created_at", "updated_at"}
    assert saved["project_id"] == project["id"] and saved["title"] == "First task"
    assert saved["description"] == "Plain text\nSecond line"
    assert (saved["type"], saved["status"], saved["priority"]) == ("task", "todo", "medium")
    assert response.headers["cache-control"] == "no-store"
    detail = f"{path}/{saved['id']}"
    changed = client.patch(detail, json={"title": "  Revised  ", "type": "bug", "status": "in_progress", "priority": "urgent"})
    assert changed.status_code == 200
    revised = changed.json()
    assert revised["title"] == "Revised" and revised["description"] == saved["description"]
    assert revised["created_at"] == saved["created_at"] and revised["updated_at"] > saved["updated_at"]
    assert client.patch(detail, json={"status": "in_progress"}).json() == revised
    assert client.patch(detail, json={"description": None}).json()["description"] is None
    for blank in ["", " \t\n "]:
        assert client.patch(detail, json={"description": "Filled"}).status_code == 200
        assert client.patch(detail, json={"description": blank}).json()["description"] is None
    final = client.patch(detail, json={"status": "done", "description": "<script>plain text, not markup</script>"}).json()
    assert final["title"] == "Revised" and final["status"] == "done"
    clean_database.dispose()
    with Session(clean_database) as db:
        row = db.get(Issue, UUID(saved["id"]))
        assert row.status == "done" and row.project_id == UUID(project["id"])
        assert row.created_at.tzinfo is not None and row.updated_at.tzinfo is not None
    with TestClient(app, base_url="http://localhost:8000") as fresh:
        fresh.cookies.set(SESSION_COOKIE, client.cookies.get(SESSION_COOKIE))
        assert fresh.get(detail).json() == final
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get(detail).status_code == 401
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(detail).json() == final
    assert client.get(path).json()["items"] == [final]
    assert client.get(f"/api/projects/{project['id']}").json() == project


def test_board_pages_and_status_moves_agree_with_list_after_relogin(client, workspace, clean_database):
    credentials, project, path = workspace
    statuses = ["backlog", "todo", "in_progress", "review", "done"]
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    with Session(clean_database) as db:
        db.add_all([Issue(project_id=UUID(project["id"]), title=f"Board issue {i}",
                          status=statuses[i % 5], created_at=base + timedelta(microseconds=i))
                    for i in range(125)])
        db.commit()
    first = client.get(path + "?limit=100&offset=0").json()
    second = client.get(path + "?limit=100&offset=100").json()
    rows = first["items"] + second["items"]
    assert len(first["items"]) == 100 and first["has_more"] is True
    assert len(second["items"]) == 25 and second["has_more"] is False
    assert len({row["id"] for row in rows}) == 125
    assert {row["status"] for row in rows} == set(statuses)
    original_order = [row["id"] for row in rows]
    selected = rows[-1]
    detail = f"{path}/{selected['id']}"
    for status in statuses:
        saved = client.patch(detail, json={"status": status})
        assert saved.status_code == 200 and saved.json()["status"] == status
        assert saved.json()["created_at"] == selected["created_at"]
    assert client.patch(detail, json={"status": "blocked"}).status_code == 422
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    # The list's 20-item pages and board's 100-item pages expose the same saved data.
    listing = [row for offset in range(0, 125, 20)
               for row in client.get(f"{path}?limit=20&offset={offset}").json()["items"]]
    assert [row["id"] for row in listing] == original_order
    assert listing[-1]["status"] == client.get(detail).json()["status"] == "done"


INVALID = [
    {"title": None}, {"title": ""}, {"title": " \t\r\n "}, {"title": "x" * 201}, {"title": 2},
    {"description": 3}, {"description": "x" * 10001}, {"type": "story"}, {"type": None},
    {"status": "blocked"}, {"status": None}, {"priority": "critical"}, {"priority": None},
    {"type": 1}, {"status": True}, {"priority": []}, {"owner_id": str(uuid4())},
    {"project_id": str(uuid4())}, {"id": str(uuid4())}, {"archived_at": None},
    {"assignee_id": None}, {"labels": []}, {"created_at": "2026-01-01T00:00:00Z"},
]


@pytest.mark.parametrize("invalid", INVALID)
def test_invalid_create_and_update_never_write(client, workspace, clean_database, invalid):
    path = workspace[2]
    issue = client.post(path, json={"title": "Original"}).json()
    create = client.post(path, json={"title": "Valid", **invalid})
    patch = client.patch(f"{path}/{issue['id']}", json=invalid)
    assert create.status_code == patch.status_code == 422
    assert create.json()["error"]["code"] == patch.json()["error"]["code"] == "validation_error"
    assert client.get(f"{path}/{issue['id']}").json() == issue
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(Issue)) == 1


def test_missing_empty_inputs_and_boundaries(client, workspace):
    path = workspace[2]
    assert client.post(path, json={}).status_code == 422
    assert client.post(path).status_code == 422
    result = client.post(path, json={"title": "x" * 200, "description": "x" * 10000})
    assert result.status_code == 201
    detail = f"{path}/{result.json()['id']}"
    assert client.patch(detail, json={}).status_code == 422
    assert client.patch(detail, json=None).status_code == 422
    assert client.patch(detail, json={"title": "y" * 200, "description": "y" * 10000}).status_code == 200
    for payload in [{"title": "Same"}, {"title": "Same", "description": " \n "}]:
        response = client.post(path, json=payload)
        assert response.status_code == 201 and response.json()["description"] is None


@pytest.mark.parametrize("field,values", [
    ("type", ["task", "bug", "feature"]),
    ("status", ["backlog", "todo", "in_progress", "review", "done"]),
    ("priority", ["low", "medium", "high", "urgent"]),
])
def test_documented_values_supported_on_create_and_update(client, workspace, field, values):
    path = workspace[2]
    for value in values:
        created = client.post(path, json={"title": "Allowed", field: value})
        assert created.status_code == 201 and created.json()[field] == value
        updated = client.patch(f"{path}/{created.json()['id']}", json={field: values[0]})
        assert updated.status_code == 200 and updated.json()[field] == values[0]


def test_archived_project_read_only_and_restore(client, workspace, clean_database):
    credentials, project, path = workspace
    issue = client.post(path, json={"title": "Kept", "description": "Preserved"}).json()
    detail = f"{path}/{issue['id']}"
    assert client.post(f"/api/projects/{project['id']}/archive", json={}).status_code == 200
    for method, url, payload in [("POST", path, {"title": "Denied"}), ("PATCH", detail, {"status": "done"})]:
        response = client.request(method, url, json=payload)
        assert response.status_code == 409 and response.json()["error"]["code"] == "project_archived"
        assert response.headers["cache-control"] == "no-store"
    assert client.get(detail).json() == issue
    assert client.get(path).json()["items"] == [issue]
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(Issue)) == 1
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(detail).json() == issue
    assert client.post(f"/api/projects/{project['id']}/restore", json={}).status_code == 200
    assert client.patch(detail, json={"status": "done"}).json()["status"] == "done"
    assert client.post(path, json={"title": "Allowed again"}).status_code == 201


def test_parent_and_issue_ownership_and_mismatched_ids(client, workspace):
    credentials, project, path = workspace
    issue = client.post(path, json={"title": "Private"}).json()
    other_project = client.post("/api/projects", json={"name": "Other own project"}).json()
    other_path = f"/api/projects/{other_project['id']}/issues"
    assert client.get(other_path).json()["items"] == []
    for method in ["GET", "PATCH"]:
        response = client.request(method, f"{other_path}/{issue['id']}", **({"json": {"title": "Wrong project"}} if method == "PATCH" else {}))
        assert response.status_code == 404 and response.json()["error"]["code"] == "issue_not_found"
    assert client.post("/api/auth/logout").status_code == 204
    other = {"email": "other-issue-owner@example.com", "password": token_urlsafe(24)}
    assert client.post("/api/auth/register", json={**other, "display_name": "Other"}).status_code == 201
    assert client.post("/api/auth/login", json=other).status_code == 200
    own = client.post("/api/projects", json={"name": "Other account"}).json()
    for method, suffix, payload in [("GET", "", None), ("POST", "", {"title": "Intrusion"}),
                                     ("GET", f"/{issue['id']}", None), ("PATCH", f"/{issue['id']}", {"status": "done"})]:
        response = client.request(method, path + suffix, **({"json": payload} if payload is not None else {}))
        missing = client.request(method, f"/api/projects/{uuid4()}/issues" + suffix, **({"json": payload} if payload is not None else {}))
        assert response.status_code == missing.status_code == 404
        assert response.json() == missing.json()
    own_path = f"/api/projects/{own['id']}/issues/{issue['id']}"
    assert client.get(own_path).status_code == 404
    assert client.patch(own_path, json={"title": "Foreign issue"}).status_code == 404
    assert client.get(f"/api/issues/{issue['id']}").status_code == 404  # No unscoped ID route.
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(f"{path}/{issue['id']}").json() == issue


def test_deterministic_tie_order_and_bounded_pagination(client, workspace, clean_database):
    path = workspace[2]
    rows = [client.post(path, json={"title": f"Issue {index}"}).json() for index in range(5)]
    tied = datetime(2026, 1, 1, tzinfo=timezone.utc)
    with clean_database.begin() as connection:
        connection.execute(update(Issue).values(created_at=tied))
    pages = [client.get(f"{path}?limit=2&offset={offset}").json() for offset in [0, 2, 4]]
    assert [row["id"] for page in pages for row in page["items"]] == sorted([row["id"] for row in rows], reverse=True)
    assert [page["has_more"] for page in pages] == [True, True, False]
    assert client.get(path + "?offset=5").json() == {"items": [], "has_more": False}
    for query in ["limit=0", "limit=101", "offset=-1", "limit=bad", "offset=bad"]:
        assert client.get(path + "?" + query).status_code == 422
    assert client.get(path + "/not-a-uuid").status_code == 422
    assert client.get("/api/projects/not-a-uuid/issues").status_code == 422
    assert client.get(path).headers["cache-control"] == "no-store"


@pytest.mark.parametrize("state", ["missing", "expired", "revoked"])
def test_session_required_for_all_issue_operations(client, workspace, clean_database, state):
    path = workspace[2]
    issue = client.post(path, json={"title": "Private"}).json()
    if state == "missing":
        client.cookies.clear()
    else:
        with clean_database.begin() as connection:
            connection.execute(update(UserSession).values(**{
                "expires_at" if state == "expired" else "revoked_at": datetime.now(timezone.utc) - timedelta(days=1)
            }))
    for method, suffix, body in [("GET", "", None), ("POST", "", {"title": "Denied"}),
                                ("GET", f"/{issue['id']}", None), ("PATCH", f"/{issue['id']}", {"status": "done"})]:
        assert client.request(method, path + suffix, **({"json": body} if body else {})).status_code == 401
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(Issue)) == 1
        assert db.get(Issue, UUID(issue["id"])).status == "todo"


@pytest.mark.parametrize("origin", [None, "null", "https://untrusted.example"])
def test_issue_writes_require_trusted_origin(client, workspace, origin):
    path = workspace[2]
    issue = client.post(path, json={"title": "Unchanged"}).json()
    client.headers.pop("origin")
    headers = {} if origin is None else {"Origin": origin}
    for method, url, payload in [("POST", path, {"title": "Denied"}), ("PATCH", f"{path}/{issue['id']}", {"status": "done"})]:
        response = client.request(method, url, headers=headers, json=payload)
        assert response.status_code == 403 and response.json()["error"]["code"] == "csrf_failed"
    assert client.get(path).json()["items"] == [issue]


@pytest.mark.parametrize("values", [
    {"title": ""}, {"title": " \t\n "}, {"title": "x" * 201}, {"description": "x" * 10001},
    {"type": "invalid"}, {"status": "invalid"}, {"priority": "invalid"}, {"project_id": uuid4()},
])
def test_database_constraints_independent_of_api(client, workspace, clean_database, values):
    with clean_database.connect() as connection:
        transaction = connection.begin()
        try:
            with pytest.raises(DBAPIError):
                connection.execute(Issue.__table__.insert().values(
                    **{"id": uuid4(), "project_id": UUID(workspace[1]["id"]), "title": "Valid", **values}
                ))
        finally:
            transaction.rollback()


def test_issue_migration_preserves_projects_and_archive_states(client, workspace, clean_database):
    _, project, path = workspace
    assert client.post(path, json={"title": "Disposable issue"}).status_code == 201
    assert client.post(f"/api/projects/{project['id']}/archive", json={}).status_code == 200
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    with clean_database.connect() as connection:
        projects = connection.execute(text("SELECT * FROM projects ORDER BY id")).all()
        users = connection.execute(text("SELECT id FROM users ORDER BY id")).all()
        sessions = connection.execute(text("SELECT id FROM sessions ORDER BY id")).all()
    command.check(cfg)
    command.downgrade(cfg, "0004_project_archival")
    try:
        assert not inspect(clean_database).has_table("issues")
        with clean_database.connect() as connection:
            assert connection.execute(text("SELECT * FROM projects ORDER BY id")).all() == projects
            assert connection.execute(text("SELECT id FROM users ORDER BY id")).all() == users
            assert connection.execute(text("SELECT id FROM sessions ORDER BY id")).all() == sessions
    finally:
        command.upgrade(cfg, "head")
    command.check(cfg)
    with clean_database.connect() as connection:
        assert connection.execute(text("SELECT * FROM projects ORDER BY id")).all() == projects
        # Defaults are also enforced for direct DB inserts, not just request schemas.
        transaction = connection.begin_nested()
        row = connection.execute(Issue.__table__.insert().values(project_id=UUID(project["id"]), title="DB defaults").returning(Issue.type, Issue.status, Issue.priority)).one()
        assert tuple(row) == ("task", "todo", "medium")
        transaction.rollback()
    assert client.get(path).json() == {"items": [], "has_more": False}
    assert client.get("/api/users/me").status_code == 200

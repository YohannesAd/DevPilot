"""Project lifecycle checks against the guarded disposable PostgreSQL database."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from secrets import token_urlsafe
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select, text, update
from sqlalchemy.orm import Session

from app.main import app
from app.models import Project, UserSession
from app.security import SESSION_COOKIE


@pytest.fixture
def managed(client):
    credentials = {"email": "manager@example.com", "password": token_urlsafe(24)}
    user = client.post("/api/auth/register", json={**credentials, "display_name": "Manager"})
    assert user.status_code == 201
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    created = client.post("/api/projects", json={"name": "Original", "description": "Keep this"})
    assert created.status_code == 201
    return credentials, user.json()["id"], created.json()


def test_edit_partial_clear_and_persist(client, managed, clean_database):
    credentials, owner_id, project = managed
    path = f"/api/projects/{project['id']}"
    edited = client.patch(path, json={"name": "  Revised  "})
    assert edited.status_code == 200
    saved = edited.json()
    assert saved["name"] == "Revised" and saved["description"] == "Keep this"
    assert saved["created_at"] == project["created_at"]
    assert saved["updated_at"] > project["updated_at"]
    assert edited.headers["cache-control"] == "no-store"
    unchanged = client.patch(path, json={"name": "Revised"}).json()
    assert unchanged == saved
    clean_database.dispose()
    with Session(clean_database) as db:
        row = db.get(Project, UUID(project["id"]))
        assert row.name == "Revised" and row.description == "Keep this"
        assert row.owner_id == UUID(owner_id)
    with TestClient(app, base_url="http://localhost:8000") as fresh:
        fresh.cookies.set(SESSION_COOKIE, client.cookies.get(SESSION_COOKIE))
        assert fresh.get(path).json() == saved
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(path).json() == saved
    cleared = client.patch(path, json={"description": None})
    assert cleared.status_code == 200
    assert cleared.json()["description"] is None and cleared.json()["name"] == "Revised"
    for blank in ["", " \t\n "]:
        assert client.patch(path, json={"description": "Filled"}).status_code == 200
        assert client.patch(path, json={"description": blank}).json()["description"] is None
    boundary = client.patch(path, json={"name": "x" * 100, "description": "y" * 2000})
    assert boundary.status_code == 200
    assert client.get(path).json() == boundary.json()


@pytest.mark.parametrize("payload", [
    {}, {"name": None}, {"name": ""}, {"name": " \t\n "}, {"name": "x" * 101},
    {"name": 123}, {"name": False}, {"description": 123}, {"description": "x" * 2001},
    {"owner_id": str(uuid4())}, {"id": str(uuid4())}, {"archived_at": None},
    {"updated_at": "2026-01-01T00:00:00Z"}, {"name": "Changed", "unsupported": True},
])
def test_invalid_edits_leave_project_unchanged(client, managed, payload):
    project = managed[2]
    path = f"/api/projects/{project['id']}"
    response = client.patch(path, json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert client.get(path).json() == project


def test_archive_restore_repetition_and_relogin(client, managed, clean_database):
    credentials, owner_id, original = managed
    path = f"/api/projects/{original['id']}"
    # Restoring an already-active project is a no-op.
    assert client.post(path + "/restore", json={}).json() == original
    archived_response = client.post(path + "/archive", json={})
    assert archived_response.status_code == 200
    archived = archived_response.json()
    assert archived["archived_at"] is not None
    assert archived["name"] == original["name"] and archived["description"] == original["description"]
    assert archived["created_at"] == original["created_at"]
    assert archived_response.headers["cache-control"] == "no-store"
    assert client.post(path + "/archive", json={}).json() == archived
    assert client.get(path).json() == archived
    assert client.get("/api/projects").json() == {"items": [], "has_more": False}
    assert client.get("/api/projects?status=archived").json()["items"] == [archived]
    blocked = client.patch(path, json={"name": "Must not change"})
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "project_archived"
    assert blocked.headers["cache-control"] == "no-store"
    clean_database.dispose()
    with Session(clean_database) as db:
        row = db.get(Project, UUID(original["id"]))
        assert row.archived_at.tzinfo is not None and row.owner_id == UUID(owner_id)
        assert row.name == original["name"]
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(path).json() == archived
    restored_response = client.post(path + "/restore", json={})
    assert restored_response.status_code == 200
    restored = restored_response.json()
    assert restored["archived_at"] is None
    assert restored["updated_at"] > archived["updated_at"]
    assert client.post(path + "/restore", json={}).json() == restored
    assert client.get("/api/projects").json()["items"] == [restored]
    assert client.get("/api/projects?status=archived").json()["items"] == []
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(path).json() == restored
    assert client.patch(path, json={"description": "Editing works again"}).status_code == 200


def test_filtering_pagination_and_owner_isolation(client, managed):
    credentials, _, first = managed
    projects = [first]
    for index in range(5):
        projects.append(client.post("/api/projects", json={"name": f"Project {index}"}).json())
    for project in projects[::2]:
        assert client.post(f"/api/projects/{project['id']}/archive", json={}).status_code == 200
    for status, expected in [("active", projects[1::2]), ("archived", projects[::2])]:
        first_page = client.get(f"/api/projects?status={status}&limit=2").json()
        last_page = client.get(f"/api/projects?status={status}&limit=2&offset=2").json()
        assert [row["id"] for row in first_page["items"] + last_page["items"]] == [p["id"] for p in reversed(expected)]
        assert first_page["has_more"] is True and last_page["has_more"] is False
        assert client.get(f"/api/projects?status={status}&offset=3").json() == {"items": [], "has_more": False}
    assert client.get("/api/projects").json() == client.get("/api/projects?status=active").json()
    for query in ["status=all", "status=", "status=archived&limit=0", "status=archived&offset=-1"]:
        assert client.get("/api/projects?" + query).status_code == 422
    assert client.post("/api/auth/logout").status_code == 204
    other = {"email": "other-manager@example.com", "password": token_urlsafe(24)}
    assert client.post("/api/auth/register", json={**other, "display_name": "Other"}).status_code == 201
    assert client.post("/api/auth/login", json=other).status_code == 200
    for status in ["active", "archived"]:
        assert client.get(f"/api/projects?status={status}").json()["items"] == []
    for project in projects[:2]:  # Both archived and active foreign projects.
        for method, suffix, body in [("GET", "", None), ("PATCH", "", {"name": "Stolen"}),
                                     ("POST", "/archive", {}), ("POST", "/restore", {})]:
            foreign = client.request(method, f"/api/projects/{project['id']}{suffix}", json=body)
            missing = client.request(method, f"/api/projects/{uuid4()}{suffix}", json=body)
            assert foreign.status_code == missing.status_code == 404
            assert foreign.json() == missing.json()
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(f"/api/projects/{first['id']}").json()["name"] == first["name"]


@pytest.mark.parametrize("state", ["missing", "expired", "revoked"])
def test_lifecycle_requires_valid_session(client, managed, clean_database, state):
    project = managed[2]
    if state == "missing":
        client.cookies.clear()
    else:
        past = datetime.now(timezone.utc) - timedelta(days=1)
        with clean_database.begin() as connection:
            connection.execute(update(UserSession).values(**{ "expires_at" if state == "expired" else "revoked_at": past }))
    path = f"/api/projects/{project['id']}"
    for method, suffix, body in [("PATCH", "", {"name": "Denied"}), ("POST", "/archive", {}), ("POST", "/restore", {})]:
        assert client.request(method, path + suffix, json=body).status_code == 401
    assert client.get("/api/projects?status=archived").status_code == 401
    with Session(clean_database) as db:
        row = db.get(Project, UUID(project["id"]))
        assert row.name == project["name"] and row.archived_at is None


@pytest.mark.parametrize("origin", [None, "null", "https://untrusted.example"])
def test_lifecycle_csrf_blocks_writes(client, managed, origin):
    project = managed[2]
    path = f"/api/projects/{project['id']}"
    client.headers.pop("origin")
    headers = {} if origin is None else {"Origin": origin}
    for method, suffix, body in [("PATCH", "", {"name": "Denied"}), ("POST", "/archive", {}), ("POST", "/restore", {})]:
        response = client.request(method, path + suffix, json=body, headers=headers)
        assert response.status_code == 403 and response.json()["error"]["code"] == "csrf_failed"
    assert client.get(path).json() == project


def test_patch_cors_and_strict_actions(client, managed):
    path = f"/api/projects/{managed[2]['id']}"
    preflight = client.options(path, headers={
        "Origin": "http://localhost:3000", "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "Content-Type",
    })
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert preflight.headers["access-control-allow-credentials"] == "true"
    assert client.options(path, headers={"Origin": "https://untrusted.example",
                                        "Access-Control-Request-Method": "PATCH"}).status_code == 400
    for suffix in ["/archive", "/restore"]:
        for body in [{"owner_id": str(uuid4())}, {"name": "Changed"}, {"archived_at": None}]:
            assert client.post(path + suffix, json=body).status_code == 422
        assert client.post(path + suffix).status_code == 422
        assert client.post("/api/projects/not-a-uuid" + suffix, json={}).status_code == 422
    assert client.get(path).json() == managed[2]


def test_archival_migration_preserves_existing_projects(client, managed, clean_database):
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    path = f"/api/projects/{managed[2]['id']}"
    archived = client.post(path + "/archive", json={}).json()
    with clean_database.connect() as connection:
        before = connection.execute(text("SELECT id, owner_id, name, description, created_at, updated_at FROM projects")).all()
        users = connection.execute(text("SELECT id FROM users")).all()
        sessions = connection.execute(text("SELECT id FROM sessions")).all()
    command.check(cfg)
    command.downgrade(cfg, "0003_create_projects")
    try:
        assert "archived_at" not in {column["name"] for column in inspect(clean_database).get_columns("projects")}
        with clean_database.connect() as connection:
            assert connection.execute(text("SELECT id, owner_id, name, description, created_at, updated_at FROM projects")).all() == before
            assert connection.execute(text("SELECT id FROM users")).all() == users
            assert connection.execute(text("SELECT id FROM sessions")).all() == sessions
    finally:
        command.upgrade(cfg, "head")
    command.check(cfg)
    assert client.get(path).json() == {**archived, "archived_at": None}
    assert client.get("/api/projects").json()["items"] == [{**archived, "archived_at": None}]
    assert client.get("/api/users/me").status_code == 200

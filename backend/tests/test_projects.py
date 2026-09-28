"""Real PostgreSQL ownership, persistence, validation, and migration checks."""

from pathlib import Path
from secrets import token_urlsafe
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from app.main import app
from app.models import Project, User, UserSession
from app.security import SESSION_COOKIE


@pytest.fixture
def owner(client):
    credentials = {"email": "project-owner@example.com", "password": token_urlsafe(24)}
    registered = client.post("/api/auth/register", json={**credentials, "display_name": "Project Owner"})
    assert registered.status_code == 201
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    return credentials, registered.json()["id"]


def test_create_read_persist_and_relogin(client, owner, clean_database):
    credentials, owner_id = owner
    assert client.get("/api/projects").json() == {"items": [], "has_more": False}
    response = client.post("/api/projects", json={"name": "  First project  ", "description": "  A real idea\nNext step  "})
    assert response.status_code == 201
    project = response.json()
    assert set(project) == {"id", "name", "description", "created_at", "updated_at"}
    assert project["name"] == "First project" and project["description"] == "A real idea\nNext step"
    assert response.headers["cache-control"] == "no-store"
    project_id = UUID(project["id"])
    # The write must commit and be visible through a completely new DB connection.
    clean_database.dispose()
    with Session(clean_database) as db:
        row = db.get(Project, project_id)
        assert row.owner_id == UUID(owner_id)
        assert row.name == project["name"]
        assert row.created_at.tzinfo is not None and row.updated_at.tzinfo is not None
    with TestClient(app, base_url="http://localhost:8000") as fresh:
        fresh.cookies.set(SESSION_COOKIE, client.cookies.get(SESSION_COOKIE))
        result = fresh.get(f"/api/projects/{project_id}")
        assert result.status_code == 200 and result.json() == project
        assert result.headers["cache-control"] == "no-store"
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get(f"/api/projects/{project_id}").status_code == 401
    assert client.post("/api/auth/login", json=credentials).status_code == 200
    assert client.get(f"/api/projects/{project_id}").json() == project
    listing = client.get("/api/projects")
    assert listing.json() == {"items": [project], "has_more": False}
    assert listing.headers["cache-control"] == "no-store"


def test_owner_isolation_and_spoofed_owner(client, owner):
    _, owner_id = owner
    project = client.post("/api/projects", json={"name": "Private"}).json()
    assert client.post("/api/auth/logout").status_code == 204
    other = {"email": "other-owner@example.com", "password": token_urlsafe(24)}
    assert client.post("/api/auth/register", json={**other, "display_name": "Other"}).status_code == 201
    assert client.post("/api/auth/login", json=other).status_code == 200
    assert client.get("/api/projects", params={"owner_id": owner_id}).json()["items"] == []
    inaccessible = client.get(f"/api/projects/{project['id']}")
    missing = client.get(f"/api/projects/{uuid4()}")
    assert inaccessible.status_code == missing.status_code == 404
    assert inaccessible.json() == missing.json() == {"error": {
        "code": "project_not_found", "message": "Project not found.",
    }}
    assert client.post("/api/projects", json={"name": "Spoof", "owner_id": owner_id}).status_code == 422
    own = client.post("/api/projects", json={"name": "Mine"})
    assert own.status_code == 201
    assert client.get("/api/projects").json()["items"] == [own.json()]


def test_authentication_required(client):
    assert client.get("/api/projects").status_code == 401
    assert client.get(f"/api/projects/{uuid4()}").status_code == 401
    assert client.post("/api/projects", json={"name": "No session"}).status_code == 401


@pytest.mark.parametrize("payload", [
    {}, {"name": ""}, {"name": " \t\n "}, {"name": "x" * 101}, {"name": 42},
    {"name": None}, {"name": "Valid", "description": "x" * 2001},
    {"name": "Valid", "description": 42}, {"name": "Valid", "extra": True},
])
def test_invalid_input_does_not_write(client, owner, clean_database, payload):
    response = client.post("/api/projects", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(Project)) == 0


@pytest.mark.parametrize("description", [None, "", " \n "])
def test_optional_description_and_boundary_lengths(client, owner, description):
    response = client.post("/api/projects", json={"name": "x" * 100, "description": description})
    assert response.status_code == 201 and response.json()["description"] is None
    assert client.post("/api/projects", json={"name": "Valid", "description": "x" * 2000}).status_code == 201


@pytest.mark.parametrize("origin", [None, "null", "https://untrusted.example"])
def test_csrf_prevents_project_creation(client, owner, clean_database, origin):
    client.headers.pop("origin")
    response = client.post("/api/projects", json={"name": "Blocked"},
                           headers={} if origin is None else {"Origin": origin})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_failed"
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(Project)) == 0


def test_pagination_and_invalid_identifiers(client, owner):
    ids = []
    for name in ["One", "Two", "Three"]:
        response = client.post("/api/projects", json={"name": name})
        assert response.status_code == 201
        ids.append(response.json()["id"])
    first = client.get("/api/projects?limit=2").json()
    second = client.get("/api/projects?limit=2&offset=2").json()
    assert [row["id"] for row in first["items"] + second["items"]] == list(reversed(ids))
    assert first["has_more"] is True and second["has_more"] is False
    assert client.get("/api/projects?offset=3").json() == {"items": [], "has_more": False}
    for query in ["limit=0", "limit=101", "offset=-1", "offset=bad"]:
        assert client.get(f"/api/projects?{query}").status_code == 422
    assert client.get("/api/projects/not-a-uuid").status_code == 422


def test_project_migration_preserves_existing_users_and_sessions(client, owner, clean_database):
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    assert client.post("/api/projects", json={"name": "Migration check"}).status_code == 201
    with Session(clean_database) as db:
        user_ids = set(db.scalars(select(User.id)))
        session_ids = set(db.scalars(select(UserSession.id)))
    command.check(cfg)
    command.downgrade(cfg, "0002_create_sessions")
    try:
        assert "projects" not in inspect(clean_database).get_table_names()
        with Session(clean_database) as db:
            assert set(db.scalars(select(User.id))) == user_ids
            assert set(db.scalars(select(UserSession.id))) == session_ids
    finally:
        command.upgrade(cfg, "head")
    command.check(cfg)
    assert client.get("/api/users/me").status_code == 200
    assert client.get("/api/projects").json()["items"] == []

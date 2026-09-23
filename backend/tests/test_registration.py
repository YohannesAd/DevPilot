from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import UUID

import pytest
from argon2 import PasswordHasher
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from app.models import User
from app.schemas.auth import RegisterRequest
from app.services.auth import EmailAlreadyRegistered, register_user

PAYLOAD = {
    "email": "Registration@example.com",
    "display_name": "  Test Developer  ",
    "password": "  test password unchanged  ",
}
CONFLICT = {"error": {
    "code": "email_already_registered",
    "message": "An account with this email already exists.",
}}


def test_registration_stores_argon2_and_returns_only_public_fields(client, clean_database):
    response = client.post("/api/auth/register", json=PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert set(data) == {"id", "email", "display_name", "created_at", "updated_at"}
    assert data["display_name"] == "Test Developer"
    assert "set-cookie" not in response.headers
    assert PAYLOAD["password"] not in response.text
    with Session(clean_database) as db:
        user = db.get(User, UUID(data["id"]))
        assert user.email == data["email"]
        assert user.password_hash.startswith("$argon2id$")
        assert PasswordHasher().verify(user.password_hash, PAYLOAD["password"])
        assert user.created_at.utcoffset().total_seconds() == 0
        assert user.updated_at is not None
        first_hash = user.password_hash
    # Identical passwords must receive independently generated salts.
    response = client.post("/api/auth/register", json={**PAYLOAD, "email": "second@example.com"})
    assert response.status_code == 201
    with Session(clean_database) as db:
        second = db.get(User, UUID(response.json()["id"]))
        assert second.password_hash != first_hash
        assert PasswordHasher().verify(second.password_hash, PAYLOAD["password"])


@pytest.mark.parametrize("changes", [
    {"email": "not-an-email"}, {"email": "a" * 255 + "@example.com"},
    {"email": None}, {"email": 123},
    {"display_name": ""}, {"display_name": " \t "},
    {"display_name": "x" * 101}, {"display_name": None}, {"display_name": 123},
    {"password": "x" * 11}, {"password": "x" * 129},
    {"password": None}, {"password": 123},
    {"unexpected": "field"},
])
def test_invalid_input_is_sanitized_and_not_persisted(client, clean_database, changes):
    response = client.post("/api/auth/register", json={**PAYLOAD, **changes})
    assert response.status_code == 422
    assert response.json() == {"error": {
        "code": "validation_error",
        "message": "Request body does not match the required schema.",
    }}
    assert PAYLOAD["password"] not in response.text
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0


@pytest.mark.parametrize("missing", ["email", "display_name", "password"])
def test_required_fields(client, missing):
    payload = {key: value for key, value in PAYLOAD.items() if key != missing}
    assert client.post("/api/auth/register", json=payload).status_code == 422


def test_malformed_json_does_not_echo_password(client):
    response = client.post(
        "/api/auth/register", content='{"password":"private-test-value",',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert "private-test-value" not in response.text


@pytest.mark.parametrize("length", [12, 128])
def test_password_limits_are_inclusive(client, length):
    assert client.post("/api/auth/register", json={
        **PAYLOAD, "password": "x" * length, "display_name": "x" * 100,
    }).status_code == 201


def test_case_insensitive_duplicate_email(client, clean_database):
    assert client.post("/api/auth/register", json=PAYLOAD).status_code == 201
    response = client.post("/api/auth/register", json={
        **PAYLOAD, "email": "registration@EXAMPLE.COM",
    })
    assert response.status_code == 409
    assert response.json() == CONFLICT
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1


def test_database_conflict_rolls_back_and_session_can_be_reused(clean_database):
    with Session(clean_database) as winner:
        register_user(winner, RegisterRequest(**PAYLOAD))
    with Session(clean_database) as loser:
        with pytest.raises(EmailAlreadyRegistered):
            register_user(loser, RegisterRequest(**{**PAYLOAD, "email": "registration@example.com"}))
        assert loser.is_active
        assert not loser.in_transaction()
        user = register_user(loser, RegisterRequest(**{**PAYLOAD, "email": "recovery@example.com"}))
        assert user.id is not None


def test_concurrent_duplicate_returns_one_created_and_one_conflict(client, clean_database):
    barrier = Barrier(2)

    def synchronize_inserts(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO users"):
            barrier.wait(timeout=15)

    event.listen(clean_database, "before_cursor_execute", synchronize_inserts)
    try:
        with ThreadPoolExecutor(max_workers=2) as workers:
            futures = [workers.submit(client.post, "/api/auth/register", json={
                **PAYLOAD, "email": email,
            }) for email in ["Race@example.com", "race@example.com"]]
            responses = [future.result(timeout=30) for future in futures]
    finally:
        event.remove(clean_database, "before_cursor_execute", synchronize_inserts)
    assert sorted(response.status_code for response in responses) == [201, 409]
    assert next(response for response in responses if response.status_code == 409).json() == CONFLICT
    with Session(clean_database) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1

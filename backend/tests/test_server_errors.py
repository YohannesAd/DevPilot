"""Server failures must remain readable by the credentialed frontend."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security import SecurityMiddleware


def failing_app():
    app = FastAPI()
    app.add_middleware(SecurityMiddleware)

    @app.get("/api/projects/test/issues")
    def fail():
        raise RuntimeError("private database diagnostic")

    return app


@pytest.mark.parametrize("origin,allowed", [
    ("http://localhost:3000", True), ("https://untrusted.example", False),
])
def test_server_error_envelope_and_cors(origin, allowed):
    with TestClient(failing_app(), raise_server_exceptions=False) as client:
        response = client.get("/api/projects/test/issues", headers={"Origin": origin})
    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == (origin if allowed else None)
    if allowed:
        assert response.headers["access-control-allow-credentials"] == "true"
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {"error": {
        "code": "internal_error", "message": "Something went wrong. Please try again.",
    }}
    assert "private database diagnostic" not in response.text


def test_server_error_still_propagates_for_logging():
    with TestClient(failing_app()) as client:
        with pytest.raises(RuntimeError, match="private database diagnostic"):
            client.get("/api/projects/test/issues", headers={"Origin": "http://localhost:3000"})

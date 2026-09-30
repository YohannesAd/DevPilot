"""Framework routing failures keep the public error/CORS/no-store contract."""
import pytest


@pytest.mark.parametrize("method,path,status,code", [
    ("GET", "/api/projects/not/a/route", 404, "not_found"),
    ("DELETE", "/api/projects", 405, "method_not_allowed"),
])
def test_framework_errors(client, method, path, status, code):
    response = client.request(method, path)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["cache-control"] == "no-store"
    if status == 405:
        assert response.headers["allow"]

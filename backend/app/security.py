"""HTTP boundary: exact-origin CSRF checks, credentialed CORS and cookie policy."""

from datetime import datetime

from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, Response

from app.config import get_auth_settings
from app.services.auth import SESSION_TTL_SECONDS

SESSION_COOKIE = "devpilot_session"


class SecurityMiddleware:
    def __init__(self, app):
        # Starlette initializes middleware on first use, not at module import.
        self.settings = get_auth_settings()
        self.downstream = app
        self.app = CORSMiddleware(
            self.check_origin, allow_origins=[self.settings.frontend_origin],
            allow_credentials=True, allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"],
        )

    async def __call__(self, scope, receive, send):
        await self.app(scope, receive, send)

    async def check_origin(self, scope, receive, send):
        if scope["type"] != "http":
            await self.downstream(scope, receive, send)
            return

        async def no_store(message):
            if message["type"] == "http.response.start" and scope["path"].startswith(
                ("/api/auth/", "/api/users/")
            ):
                MutableHeaders(scope=message)["Cache-Control"] = "no-store"
            await send(message)

        if scope["method"] not in {"GET", "HEAD", "OPTIONS"}:
            origins = Headers(scope=scope).getlist("origin")
            if len(origins) != 1 or origins[0] not in {
                self.settings.frontend_origin, self.settings.api_origin
            }:
                response = JSONResponse(status_code=403, content={"error": {
                    "code": "csrf_failed", "message": "A trusted Origin header is required.",
                }})
                await response(scope, receive, no_store)
                return
        await self.downstream(scope, receive, no_store)


def set_session_cookie(response: Response, token: str, expires_at: datetime) -> None:
    response.set_cookie(
        SESSION_COOKIE, token, max_age=SESSION_TTL_SECONDS, expires=expires_at,
        path="/", httponly=True, samesite="lax", secure=get_auth_settings().secure_cookie,
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE, path="/", httponly=True, samesite="lax",
        secure=get_auth_settings().secure_cookie,
    )

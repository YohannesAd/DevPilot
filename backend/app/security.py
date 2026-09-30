"""HTTP boundary: exact-origin CSRF checks, credentialed CORS and cookie policy."""

from datetime import datetime
from hmac import compare_digest

from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.errors import ServerErrorMiddleware
from starlette.responses import JSONResponse, Response

from app.config import get_auth_settings, get_rate_limit_settings, get_proxy_settings
from app.client_ip import address
from app.services.auth import SESSION_TTL_SECONDS

SESSION_COOKIE = "devpilot_session"


async def server_error(_request, _exc):
    return JSONResponse(status_code=500, content={"error": {
        "code": "internal_error", "message": "Something went wrong. Please try again.",
    }})


class SecurityMiddleware:
    def __init__(self, app):
        # Starlette initializes middleware on first use, not at module import.
        self.settings = get_auth_settings()
        self.proxy = get_proxy_settings()
        get_rate_limit_settings()  # Validate limits and proxy/secret settings before serving requests.
        # Render failures inside CORS/no-store so the frontend can read the 500.
        # ServerErrorMiddleware re-raises afterwards, preserving server logging.
        self.downstream = ServerErrorMiddleware(app, handler=server_error)
        self.app = CORSMiddleware(
            self.check_origin, allow_origins=[self.settings.frontend_origin],
            allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
            allow_headers=["Content-Type"], expose_headers=["Retry-After"],
        )

    async def __call__(self, scope, receive, send):
        await self.app(scope, receive, send)

    async def check_origin(self, scope, receive, send):
        if scope["type"] != "http":
            await self.downstream(scope, receive, send)
            return

        async def no_store(message):
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["Cache-Control"] = "no-store"
            await send(message)

        # Render's direct public endpoint cannot bypass the authenticated frontend.
        # Health is liveness only and is the sole public exception.
        if self.proxy.secret and not (scope["method"] in {"GET", "HEAD"} and scope["path"] == "/api/health"):
            headers = Headers(scope=scope)
            tokens = headers.getlist("x-devpilot-proxy-secret")
            ips = headers.getlist("x-devpilot-client-ip")
            valid = len(tokens) == 1 and compare_digest(tokens[0].encode(), self.proxy.secret.encode())
            try:
                ip = str(address(ips[0])) if len(ips) == 1 else None
            except ValueError:
                ip = None
            if not valid or ip is None:
                response = JSONResponse(status_code=403, content={"error": {
                    "code": "proxy_required", "message": "Use the application to access this service.",
                }})
                await response(scope, receive, no_store)
                return
            scope.setdefault("state", {})["verified_client_ip"] = ip

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

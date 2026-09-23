from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.security import SecurityMiddleware
from app.services.auth import AuthenticationRequired, InvalidCredentials

app = FastAPI(title="DevPilot API")

app.add_middleware(SecurityMiddleware)

app.include_router(auth_router)
app.include_router(users_router)


@app.exception_handler(InvalidCredentials)
async def invalid_credentials(_request: Request, _exc: InvalidCredentials) -> JSONResponse:
    return JSONResponse(status_code=401, content={"error": {
        "code": "invalid_credentials", "message": "Invalid email or password.",
    }})


@app.exception_handler(AuthenticationRequired)
async def authentication_required(_request: Request, _exc: AuthenticationRequired) -> JSONResponse:
    return JSONResponse(status_code=401, content={"error": {
        "code": "authentication_required", "message": "A valid session is required.",
    }})


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, _exc: RequestValidationError) -> JSONResponse:
    # FastAPI's default validation details can echo a submitted password.
    return JSONResponse(status_code=422, content={"error": {
        "code": "validation_error",
        "message": "Request body does not match the required schema.",
    }})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "devpilot-api"}

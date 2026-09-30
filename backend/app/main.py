from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.projects import router as projects_router
from app.routes.issues import router as issues_router
from app.routes.organization import router as organization_router
from app.routes.dashboard import router as dashboard_router
from app.services.organization import OrganizationError
from app.security import SecurityMiddleware
from app.services.auth import AuthenticationRequired, InvalidCredentials
from app.services.projects import ProjectArchived, ProjectNotFound
from app.services.issues import IssueNotFound

app = FastAPI(title="DevPilot API")

app.add_middleware(SecurityMiddleware)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(projects_router)
app.include_router(issues_router)
app.include_router(organization_router)
app.include_router(dashboard_router)


@app.exception_handler(OrganizationError)
async def organization_error(_request: Request, exc: OrganizationError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})


@app.exception_handler(IssueNotFound)
async def issue_not_found(_request: Request, _exc: IssueNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": {
        "code": "issue_not_found", "message": "Issue not found.",
    }})


@app.exception_handler(ProjectArchived)
async def project_archived(_request: Request, _exc: ProjectArchived) -> JSONResponse:
    return JSONResponse(status_code=409, content={"error": {
        "code": "project_archived", "message": "Restore this project before editing it.",
    }})


@app.exception_handler(ProjectNotFound)
async def project_not_found(_request: Request, _exc: ProjectNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": {
        "code": "project_not_found", "message": "Project not found.",
    }})


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

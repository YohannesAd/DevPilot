from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes.auth import router as auth_router

app = FastAPI(title="DevPilot API")

# Local development only. Replace with a configured exact origin during deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(auth_router)


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

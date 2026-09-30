from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_session
from app.models import UserSession
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard import summary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardSummary)
def dashboard(session: Annotated[UserSession, Depends(require_session)], db: Annotated[Session, Depends(get_db)]):
    return summary(db, session.user_id)

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.metrics import HealthResponse, MetricsResponse
from app.services.smhi import SMHIClient

router = APIRouter()
_smhi = SMHIClient(settings.smhi_base_url)


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/api/metrics", response_model=MetricsResponse, tags=["metrics"])
def metrics(lat: float, lon: float) -> MetricsResponse:
    return _smhi.get_metrics(lat, lon)

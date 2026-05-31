from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.schemas.cloud_cover import CloudCoverResponse
from app.schemas.metrics import HealthResponse, MetricsResponse
from app.services.cloud_cover import (
    CloudCoverService,
    NoStationFound,
    SMHIUnavailable,
)
from app.services.smhi import SMHIClient

router = APIRouter()
_smhi = SMHIClient(settings.smhi_base_url)

_service: CloudCoverService | None = None


def get_cloud_cover_service() -> CloudCoverService:
    """Lazily build a process-wide CloudCoverService. Overridable in tests via
    app.dependency_overrides."""
    global _service
    if _service is None:
        from app.db.session import engine
        from app.repositories.sqlite import SqliteRepository

        client = SMHIClient(
            base_url=settings.smhi_base_url, param=settings.cloud_cover_param
        )
        _service = CloudCoverService(client, SqliteRepository(engine), settings)
    return _service


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/api/metrics", response_model=MetricsResponse, tags=["metrics"])
def metrics(lat: float, lon: float) -> MetricsResponse:
    return _smhi.get_metrics(lat, lon)


@router.get(
    "/api/cloud-cover",
    response_model=CloudCoverResponse,
    tags=["cloud-cover"],
)
def cloud_cover(
    lat: float,
    lon: float,
    resolution: Literal["hourly", "daily", "monthly"] = "daily",
    service: CloudCoverService = Depends(get_cloud_cover_service),
) -> CloudCoverResponse:
    try:
        return service.get_cloud_cover(lat, lon, resolution)
    except NoStationFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SMHIUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

from enum import IntEnum
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import settings
from app.db.session import engine
from app.repositories.lightning_sqlite import SqliteLightningRepository
from app.repositories.sqlite import SqliteRepository
from app.schemas.cloud_cover import CloudCoverResponse
from app.schemas.health import HealthResponse
from app.schemas.lightning import LightningResponse
from app.services.cloud_cover import (
    CloudCoverService,
    NoStationFound,
    SMHIUnavailable,
)
from app.services.lightning import LightningService, LightningUnavailable
from app.services.lightning_client import LightningClient
from app.services.smhi import SMHIClient

router = APIRouter()


class CloudParam(IntEnum):
    """Supported SMHI cloud parameters, as an integer enum so the query value
    is validated (422 on anything else) and surfaces as an int enum in OpenAPI."""

    TOTAL = 16  # total cloud cover, percent
    LOW = 29  # low-cloud amount, octas


@lru_cache(maxsize=1)
def get_cloud_cover_service() -> CloudCoverService:
    """Lazily build a process-wide CloudCoverService. Overridable in tests via
    app.dependency_overrides."""

    client = SMHIClient(base_url=settings.smhi_base_url)
    return CloudCoverService(client, SqliteRepository(engine), settings)


@lru_cache(maxsize=1)
def get_lightning_service() -> LightningService:
    """Lazily build a process-wide LightningService. Overridable in tests."""

    client = LightningClient(base_url=settings.lightning_base_url)
    return LightningService(client, SqliteLightningRepository(engine), settings)


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get(
    "/api/cloud-cover",
    response_model=CloudCoverResponse,
    tags=["cloud-cover"],
)
def cloud_cover(
    lat: float,
    lon: float,
    resolution: Literal["hourly", "daily", "monthly"] = "daily",
    param: CloudParam = CloudParam.TOTAL,
    service: CloudCoverService = Depends(get_cloud_cover_service),
) -> CloudCoverResponse:
    try:
        return service.get_cloud_cover(lat, lon, resolution, param=int(param))
    except NoStationFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except SMHIUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/api/lightning",
    response_model=LightningResponse,
    tags=["lightning"],
)
def lightning(
    lat: float,
    lon: float,
    resolution: Literal["hourly", "daily", "monthly"] = "daily",
    service: LightningService = Depends(get_lightning_service),
) -> LightningResponse:
    try:
        return service.get_lightning(lat, lon, resolution)
    except LightningUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

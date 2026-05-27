"""Placeholder SMHI client. Real integration is a later spec."""

from app.schemas.metrics import MetricsResponse


class SMHIClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url

    def get_metrics(self, lat: float, lon: float) -> MetricsResponse:
        # TODO: resolve (lat, lon) to SMHI station(s) and compute from
        # historical observations. Returns stub values for now.
        return MetricsResponse(
            lat=lat,
            lon=lon,
            cloud_cover_pct=0.0,
            lightning_probability=0.0,
            note="stub data",
        )

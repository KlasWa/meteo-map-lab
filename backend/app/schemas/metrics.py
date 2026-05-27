from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class MetricsResponse(BaseModel):
    lat: float
    lon: float
    cloud_cover_pct: float
    lightning_probability: float
    note: str

from pydantic import BaseModel


class LightningPoint(BaseModel):
    ts: int  # epoch ms, UTC (bucket start)
    count: int  # strikes in the bucket within the radius


class LightningCenter(BaseModel):
    lat: float
    lon: float


class LightningResponse(BaseModel):
    center: LightningCenter
    radius_km: float
    resolution: str
    unit: str = "strikes"
    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
    points: list[LightningPoint]

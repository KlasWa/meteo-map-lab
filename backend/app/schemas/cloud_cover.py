from pydantic import BaseModel


class CloudPoint(BaseModel):
    ts: int  # epoch ms, UTC (bucket start for daily/monthly)
    value: float | None  # mean cloud %, None when no usable samples
    count: int  # usable (non-null) samples in the bucket


class StationInfo(BaseModel):
    id: int
    name: str
    lat: float
    lon: float
    distance_km: float


class CloudCoverResponse(BaseModel):
    station: StationInfo
    resolution: str
    unit: str = "percent"
    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
    points: list[CloudPoint]

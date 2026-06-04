from pydantic import BaseModel


class CloudPoint(BaseModel):
    ts: int  # epoch ms, UTC (bucket start for daily/monthly)
    value: float | None  # mean value in native unit (% or octas), None = no usable samples
    count: int  # usable (non-null) samples in the bucket


class StationInfo(BaseModel):
    id: int
    name: str
    lat: float
    lon: float
    distance_km: float


class CloudCoverResponse(BaseModel):
    station: StationInfo
    param: int
    resolution: str
    unit: str
    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
    points: list[CloudPoint]


class CombinedCloudCoverResponse(BaseModel):
    station: StationInfo
    source_params: list[int]  # layers combined, e.g. [29, 31, 33, 35]
    resolution: str
    unit: str  # "octas"
    stale: bool = False
    attribution: str = "Data: SMHI (CC BY 4.0)"
    points: list[CloudPoint]

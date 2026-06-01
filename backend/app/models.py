"""SQLModel tables for the cloud cache. `param` is part of the identity so the
same station id can hold rows for multiple SMHI parameters."""

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class Station(SQLModel, table=True):
    param: int = Field(default=16, primary_key=True)  # SMHI parameter id
    id: int = Field(primary_key=True)  # SMHI station id
    name: str
    lat: float
    lon: float
    active: bool = True
    from_ts: int | None = None
    to_ts: int | None = None


class Observation(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("param", "station_id", "ts_utc", name="uq_obs_param_station_ts"),
    )
    id: int | None = Field(default=None, primary_key=True)
    param: int = Field(default=16, index=True)
    station_id: int = Field(index=True)
    ts_utc: int = Field(index=True)  # epoch ms, UTC
    value: float | None = None  # native unit (percent/octas), None = indeterminate
    quality: str


class FetchLog(SQLModel, table=True):
    """Ledger of what has been fetched. station_id=0 with kind='station_list'
    records the per-parameter station-list refresh."""

    __table_args__ = (
        UniqueConstraint("param", "station_id", "kind", name="uq_fetchlog_param_station_kind"),
    )
    id: int | None = Field(default=None, primary_key=True)
    param: int = Field(default=16, index=True)
    station_id: int = Field(index=True)
    kind: str  # "archive" | "recent" | "station_list"
    fetched_at: int  # epoch ms
    covered_from: int | None = None
    covered_to: int | None = None

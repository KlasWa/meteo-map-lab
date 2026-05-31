"""SQLModel tables for the cloud-cover cache."""

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class Station(SQLModel, table=True):
    id: int = Field(primary_key=True)  # SMHI station id
    name: str
    lat: float
    lon: float
    active: bool = True
    from_ts: int | None = None
    to_ts: int | None = None


class Observation(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("station_id", "ts_utc", name="uq_obs_station_ts"),)
    id: int | None = Field(default=None, primary_key=True)
    station_id: int = Field(index=True)
    ts_utc: int = Field(index=True)  # epoch ms, UTC
    cloud_pct: float | None = None  # 0-100, None = indeterminate/missing
    quality: str


class FetchLog(SQLModel, table=True):
    """Ledger of what has been fetched. station_id=0 with kind='station_list'
    records the global station-list refresh."""

    __table_args__ = (UniqueConstraint("station_id", "kind", name="uq_fetchlog_station_kind"),)
    id: int | None = Field(default=None, primary_key=True)
    station_id: int = Field(index=True)
    kind: str  # "archive" | "recent" | "station_list"
    fetched_at: int  # epoch ms
    covered_from: int | None = None
    covered_to: int | None = None

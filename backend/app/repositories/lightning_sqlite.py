"""SQLite-backed LightningRepository using SQLModel."""

from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.dto import StrikeRaw
from app.models import LightningDay, LightningStrike
from app.repositories.lightning_base import LightningRepository


class SqliteLightningRepository(LightningRepository):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def upsert_strikes(self, strikes: list[StrikeRaw]) -> None:
        if not strikes:
            return
        rows = [
            {
                "ts_utc": s.ts_utc,
                "lat": s.lat,
                "lon": s.lon,
                "peak_current": s.peak_current,
                "cloud_indicator": s.cloud_indicator,
            }
            for s in strikes
        ]
        stmt = sqlite_insert(LightningStrike).values(rows)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["ts_utc", "lat", "lon"],
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def get_day(self, day_start_ms: int) -> LightningDay | None:
        with Session(self._engine) as s:
            return s.get(LightningDay, day_start_ms)

    def record_day(self, day_start_ms: int, fetched_at: int, count: int) -> None:
        stmt = sqlite_insert(LightningDay).values(
            day_start_ms=day_start_ms, fetched_at=fetched_at, count=count
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["day_start_ms"],
            set_={"fetched_at": stmt.excluded.fetched_at, "count": stmt.excluded.count},
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def has_any_day(self) -> bool:
        with Session(self._engine) as s:
            return s.exec(select(LightningDay.day_start_ms).limit(1)).first() is not None

    def strikes_in_bbox(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float,
        start_ts: int,
        end_ts: int,
    ) -> list[StrikeRaw]:
        with Session(self._engine) as s:
            rows = s.exec(
                select(LightningStrike).where(
                    LightningStrike.ts_utc >= start_ts,
                    LightningStrike.ts_utc <= end_ts,
                    LightningStrike.lat >= min_lat,
                    LightningStrike.lat <= max_lat,
                    LightningStrike.lon >= min_lon,
                    LightningStrike.lon <= max_lon,
                )
            ).all()
        return [
            StrikeRaw(
                ts_utc=r.ts_utc,
                lat=r.lat,
                lon=r.lon,
                peak_current=r.peak_current,
                cloud_indicator=r.cloud_indicator,
            )
            for r in rows
        ]

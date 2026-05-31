"""SQLite-backed CacheRepository using SQLModel."""

from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from app.dto import ParsedObs, StationRaw
from app.models import FetchLog, Observation, Station
from app.repositories.base import CacheRepository
from app.services.geo import haversine_km


class SqliteRepository(CacheRepository):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def upsert_stations(self, stations: list[StationRaw]) -> None:
        if not stations:
            return
        rows = [
            {
                "id": s.id,
                "name": s.name,
                "lat": s.lat,
                "lon": s.lon,
                "active": s.active,
                "from_ts": s.from_ts,
                "to_ts": s.to_ts,
            }
            for s in stations
        ]
        stmt = sqlite_insert(Station).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "name": stmt.excluded.name,
                "lat": stmt.excluded.lat,
                "lon": stmt.excluded.lon,
                "active": stmt.excluded.active,
                "from_ts": stmt.excluded.from_ts,
                "to_ts": stmt.excluded.to_ts,
            },
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def station_count(self) -> int:
        with Session(self._engine) as s:
            return len(s.exec(select(Station.id)).all())

    def nearest_station(
        self, lat: float, lon: float, max_km: float
    ) -> StationRaw | None:
        with Session(self._engine) as s:
            stations = s.exec(select(Station)).all()
        best: Station | None = None
        best_d: float | None = None
        for st in stations:
            d = haversine_km(lat, lon, st.lat, st.lon)
            if best_d is None or d < best_d:
                best, best_d = st, d
        if best is None or best_d > max_km:
            return None
        return StationRaw(
            id=best.id,
            name=best.name,
            lat=best.lat,
            lon=best.lon,
            active=best.active,
            from_ts=best.from_ts,
            to_ts=best.to_ts,
        )

    def upsert_observations(
        self, station_id: int, obs: list[ParsedObs]
    ) -> None:
        if not obs:
            return
        rows = [
            {
                "station_id": station_id,
                "ts_utc": o.ts_utc,
                "cloud_pct": o.cloud_pct,
                "quality": o.quality,
            }
            for o in obs
        ]
        stmt = sqlite_insert(Observation).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["station_id", "ts_utc"],
            set_={
                "cloud_pct": stmt.excluded.cloud_pct,
                "quality": stmt.excluded.quality,
            },
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def get_observations(
        self, station_id: int, start_ts: int, end_ts: int
    ) -> list[ParsedObs]:
        with Session(self._engine) as s:
            rows = s.exec(
                select(Observation)
                .where(
                    Observation.station_id == station_id,
                    Observation.ts_utc >= start_ts,
                    Observation.ts_utc <= end_ts,
                )
                .order_by(Observation.ts_utc)
            ).all()
        return [ParsedObs(r.ts_utc, r.cloud_pct, r.quality) for r in rows]

    def get_fetch_log(self, station_id: int, kind: str) -> FetchLog | None:
        with Session(self._engine) as s:
            return s.exec(
                select(FetchLog).where(
                    FetchLog.station_id == station_id, FetchLog.kind == kind
                )
            ).first()

    def record_fetch(
        self,
        station_id: int,
        kind: str,
        fetched_at: int,
        covered_from: int | None,
        covered_to: int | None,
    ) -> None:
        with Session(self._engine) as s:
            existing = s.exec(
                select(FetchLog).where(
                    FetchLog.station_id == station_id, FetchLog.kind == kind
                )
            ).first()
            if existing:
                existing.fetched_at = fetched_at
                existing.covered_from = covered_from
                existing.covered_to = covered_to
                s.add(existing)
            else:
                s.add(
                    FetchLog(
                        station_id=station_id,
                        kind=kind,
                        fetched_at=fetched_at,
                        covered_from=covered_from,
                        covered_to=covered_to,
                    )
                )
            s.commit()

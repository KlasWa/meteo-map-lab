"""SQLite-backed CacheRepository using SQLModel. All queries are scoped by
`param` so multiple SMHI parameters share the same tables without colliding."""

from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Engine
from sqlmodel import Session, delete, select

from app.dto import ParsedObs, StationRaw
from app.models import FetchLog, Observation, Station
from app.repositories.base import CacheRepository
from app.services.geo import haversine_km


class SqliteRepository(CacheRepository):
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def upsert_stations(self, stations: list[StationRaw], param: int = 16) -> None:
        if not stations:
            return
        rows = [
            {
                "param": param,
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
            index_elements=["param", "id"],
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

    def station_count(self, param: int = 16) -> int:
        with Session(self._engine) as s:
            return len(s.exec(select(Station.id).where(Station.param == param)).all())

    def nearest_station(
        self, lat: float, lon: float, max_km: float, param: int = 16
    ) -> StationRaw | None:
        # Only active stations have a latest-months data file on SMHI; closed
        # stations would 404 on fetch_recent, so they are not selectable.
        with Session(self._engine) as s:
            stations = s.exec(
                select(Station).where(Station.param == param, Station.active == True)  # noqa: E712
            ).all()
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
        self, station_id: int, obs: list[ParsedObs], param: int = 16
    ) -> None:
        if not obs:
            return
        rows = [
            {
                "param": param,
                "station_id": station_id,
                "ts_utc": o.ts_utc,
                "value": o.value,
                "quality": o.quality,
            }
            for o in obs
        ]
        stmt = sqlite_insert(Observation).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["param", "station_id", "ts_utc"],
            set_={
                "value": stmt.excluded.value,
                "quality": stmt.excluded.quality,
            },
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def get_observations(
        self, station_id: int, start_ts: int, end_ts: int, param: int = 16
    ) -> list[ParsedObs]:
        with Session(self._engine) as s:
            rows = s.exec(
                select(Observation)
                .where(
                    Observation.param == param,
                    Observation.station_id == station_id,
                    Observation.ts_utc >= start_ts,
                    Observation.ts_utc <= end_ts,
                )
                .order_by(Observation.ts_utc)
            ).all()
        return [ParsedObs(r.ts_utc, r.value, r.quality) for r in rows]

    def get_fetch_log(self, station_id: int, kind: str, param: int = 16) -> FetchLog | None:
        with Session(self._engine) as s:
            return s.exec(
                select(FetchLog).where(
                    FetchLog.param == param,
                    FetchLog.station_id == station_id,
                    FetchLog.kind == kind,
                )
            ).first()

    def record_fetch(
        self,
        station_id: int,
        kind: str,
        fetched_at: int,
        covered_from: int | None,
        covered_to: int | None,
        param: int = 16,
    ) -> None:
        # Atomic upsert on the (param, station_id, kind) unique constraint.
        # A select-then-insert here races under concurrent same-param requests
        # (the frontend fetches params in parallel; dev StrictMode double-fires),
        # producing "UNIQUE constraint failed". ON CONFLICT DO UPDATE is safe.
        stmt = sqlite_insert(FetchLog).values(
            param=param,
            station_id=station_id,
            kind=kind,
            fetched_at=fetched_at,
            covered_from=covered_from,
            covered_to=covered_to,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["param", "station_id", "kind"],
            set_={
                "fetched_at": stmt.excluded.fetched_at,
                "covered_from": stmt.excluded.covered_from,
                "covered_to": stmt.excluded.covered_to,
            },
        )
        with Session(self._engine) as s:
            s.execute(stmt)
            s.commit()

    def purge(self) -> dict[str, int]:
        # Count then delete: SQLite DELETE-without-WHERE rowcount is unreliable.
        with Session(self._engine) as s:
            counts = {
                "observations": len(s.exec(select(Observation.id)).all()),
                "stations": len(s.exec(select(Station.id)).all()),
                "fetch_logs": len(s.exec(select(FetchLog.id)).all()),
            }
            s.execute(delete(Observation))
            s.execute(delete(Station))
            s.execute(delete(FetchLog))
            s.commit()
        return counts

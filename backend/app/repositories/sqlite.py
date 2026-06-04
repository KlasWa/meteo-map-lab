"""SQLite-backed CacheRepository using SQLModel. All queries are scoped by
`param` so multiple SMHI parameters share the same tables without colliding."""

from sqlalchemy import bindparam, text
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Engine
from sqlmodel import Session, delete, select

from app.dto import AggPoint, ParsedObs, StationRaw
from app.models import FetchLog, Observation, Station
from app.repositories.base import CacheRepository
from app.services.geo import haversine_km

# Cap bound variables per INSERT well under SQLite's SQLITE_MAX_VARIABLE_NUMBER
# (>=999 on any version) so large station lists / archives are inserted in
# batches rather than one oversized statement.
_MAX_SQL_VARS = 900


def _bucket_expr(resolution: str) -> str:
    """SQLite expression that maps `ts_utc` (epoch ms) to the start-of-bucket
    epoch ms for the chosen resolution. Hourly leaves the timestamp alone
    (input is already hourly); daily/monthly use the `'start of day' / 'start
    of month'` modifier in UTC."""
    if resolution == "hourly":
        return "ts_utc"
    if resolution == "daily":
        modifier = "start of day"
    elif resolution == "monthly":
        modifier = "start of month"
    else:
        raise ValueError(f"unknown resolution: {resolution!r}")
    return (
        "CAST(strftime('%s', ts_utc / 1000, 'unixepoch', "
        f"'{modifier}') AS INTEGER) * 1000"
    )


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
        chunk = max(1, _MAX_SQL_VARS // 8)  # 8 columns per row
        with Session(self._engine) as s:
            for i in range(0, len(rows), chunk):
                stmt = sqlite_insert(Station).values(rows[i : i + chunk])
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
        chunk = max(1, _MAX_SQL_VARS // 5)  # 5 columns per row
        with Session(self._engine) as s:
            for i in range(0, len(rows), chunk):
                stmt = sqlite_insert(Observation).values(rows[i : i + chunk])
                stmt = stmt.on_conflict_do_update(
                    index_elements=["param", "station_id", "ts_utc"],
                    set_={
                        "value": stmt.excluded.value,
                        "quality": stmt.excluded.quality,
                    },
                )
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

    def aggregate_observations(
        self,
        station_id: int,
        start_ts: int,
        end_ts: int,
        resolution: str,
        param: int = 16,
    ) -> list[AggPoint]:
        bucket = _bucket_expr(resolution)
        sql = text(
            f"""
            SELECT
                {bucket} AS bucket,
                ROUND(AVG(value), 2) AS value,
                COUNT(value) AS cnt
            FROM observation
            WHERE param = :param
              AND station_id = :station_id
              AND ts_utc >= :start_ts
              AND ts_utc <= :end_ts
            GROUP BY bucket
            ORDER BY bucket
            """
        )
        with Session(self._engine) as s:
            rows = s.execute(
                sql,
                {
                    "param": param,
                    "station_id": station_id,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            ).all()
        return [AggPoint(ts=int(b), value=v, count=int(c)) for b, v, c in rows]

    def aggregate_combined_observations(
        self,
        station_id: int,
        start_ts: int,
        end_ts: int,
        resolution: str,
        params: list[int],
    ) -> list[AggPoint]:
        if not params:
            return []
        # Filter `value IS NOT NULL` inside the per-timestamp MAX so a bucket
        # never appears for timestamps where every layer was indeterminate —
        # matching the Python merge_layers_max + aggregate path it replaces.
        bucket = _bucket_expr(resolution)
        sql = text(
            f"""
            SELECT
                {bucket} AS bucket,
                ROUND(AVG(max_value), 2) AS value,
                COUNT(max_value) AS cnt
            FROM (
                SELECT ts_utc, MAX(value) AS max_value
                FROM observation
                WHERE param IN :params
                  AND station_id = :station_id
                  AND ts_utc >= :start_ts
                  AND ts_utc <= :end_ts
                  AND value IS NOT NULL
                GROUP BY ts_utc
            ) merged
            GROUP BY bucket
            ORDER BY bucket
            """
        ).bindparams(bindparam("params", expanding=True))
        with Session(self._engine) as s:
            rows = s.execute(
                sql,
                {
                    "params": params,
                    "station_id": station_id,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            ).all()
        return [AggPoint(ts=int(b), value=v, count=int(c)) for b, v, c in rows]

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

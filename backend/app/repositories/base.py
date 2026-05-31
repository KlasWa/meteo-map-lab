"""Storage-agnostic cache interface. SqliteRepository is the default impl;
a Parquet/DuckDB impl could be swapped in without touching the service."""

from abc import ABC, abstractmethod

from app.dto import ParsedObs, StationRaw
from app.models import FetchLog


class CacheRepository(ABC):
    @abstractmethod
    def upsert_stations(self, stations: list[StationRaw]) -> None: ...

    @abstractmethod
    def station_count(self) -> int: ...

    @abstractmethod
    def nearest_station(
        self, lat: float, lon: float, max_km: float
    ) -> StationRaw | None: ...

    @abstractmethod
    def upsert_observations(
        self, station_id: int, obs: list[ParsedObs]
    ) -> None: ...

    @abstractmethod
    def get_observations(
        self, station_id: int, start_ts: int, end_ts: int
    ) -> list[ParsedObs]: ...

    @abstractmethod
    def get_fetch_log(self, station_id: int, kind: str) -> FetchLog | None: ...

    @abstractmethod
    def record_fetch(
        self,
        station_id: int,
        kind: str,
        fetched_at: int,
        covered_from: int | None,
        covered_to: int | None,
    ) -> None: ...

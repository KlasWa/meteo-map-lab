"""Storage-agnostic cache interface. SqliteRepository is the default impl;
a Parquet/DuckDB impl could be swapped in without touching the service. Every
method is scoped by SMHI parameter id (`param`)."""

from abc import ABC, abstractmethod

from app.dto import ParsedObs, StationRaw
from app.models import FetchLog


class CacheRepository(ABC):
    @abstractmethod
    def upsert_stations(self, stations: list[StationRaw], param: int = 16) -> None: ...

    @abstractmethod
    def station_count(self, param: int = 16) -> int: ...

    @abstractmethod
    def nearest_station(
        self, lat: float, lon: float, max_km: float, param: int = 16
    ) -> StationRaw | None: ...

    @abstractmethod
    def upsert_observations(
        self, station_id: int, obs: list[ParsedObs], param: int = 16
    ) -> None: ...

    @abstractmethod
    def get_observations(
        self, station_id: int, start_ts: int, end_ts: int, param: int = 16
    ) -> list[ParsedObs]: ...

    @abstractmethod
    def get_fetch_log(self, station_id: int, kind: str, param: int = 16) -> FetchLog | None: ...

    @abstractmethod
    def record_fetch(
        self,
        station_id: int,
        kind: str,
        fetched_at: int,
        covered_from: int | None,
        covered_to: int | None,
        param: int = 16,
    ) -> None: ...

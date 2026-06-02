"""Storage-agnostic interface for cached lightning strikes."""

from abc import ABC, abstractmethod

from app.dto import StrikeRaw
from app.models import LightningDay


class LightningRepository(ABC):
    @abstractmethod
    def upsert_strikes(self, strikes: list[StrikeRaw]) -> None: ...

    @abstractmethod
    def get_day(self, day_start_ms: int) -> LightningDay | None: ...

    @abstractmethod
    def record_day(self, day_start_ms: int, fetched_at: int, count: int) -> None: ...

    @abstractmethod
    def strikes_in_bbox(
        self,
        min_lat: float,
        max_lat: float,
        min_lon: float,
        max_lon: float,
        start_ts: int,
        end_ts: int,
    ) -> list[StrikeRaw]: ...

"""Transient data-transfer objects shared by the SMHI client, parsers,
repository, and service. Deliberately free of DB and HTTP dependencies."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ParsedObs:
    """One parsed cloud observation, storage-agnostic."""

    ts_utc: int  # epoch milliseconds, UTC
    value: float | None  # native unit (percent or octas), None = indeterminate
    quality: str  # SMHI quality code: G / Y / R


@dataclass(frozen=True)
class StationRaw:
    """A station as returned by the SMHI parameter listing."""

    id: int
    name: str
    lat: float
    lon: float
    active: bool
    from_ts: int | None = None
    to_ts: int | None = None


@dataclass(frozen=True)
class AggPoint:
    """One aggregated bucket as produced by the repository's SQL-side
    aggregation. The service maps these to schema CloudPoint without
    re-shaping them."""

    ts: int  # epoch milliseconds at the start of the bucket, UTC
    value: float | None  # bucket mean (or hourly raw value); None when empty
    count: int  # number of non-null observations contributing to the bucket


@dataclass(frozen=True)
class StrikeRaw:
    """One parsed lightning strike, storage-agnostic."""

    ts_utc: int  # epoch milliseconds, UTC
    lat: float
    lon: float
    peak_current: float  # kA, sign = polarity
    cloud_indicator: int  # 0/1: ground vs cloud flash

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

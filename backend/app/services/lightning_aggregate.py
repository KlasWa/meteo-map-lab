"""Bucket lightning strikes into hourly/daily/monthly counts (UTC)."""

from app.dto import StrikeRaw
from app.schemas.lightning import LightningPoint
from app.services.timebuckets import day_key, hour_key, month_key

_KEYS = {"hourly": hour_key, "daily": day_key, "monthly": month_key}


def aggregate_counts(strikes: list[StrikeRaw], resolution: str) -> list[LightningPoint]:
    key_fn = _KEYS[resolution]
    counts: dict[int, int] = {}
    for s in strikes:
        k = key_fn(s.ts_utc)
        counts[k] = counts.get(k, 0) + 1
    return [LightningPoint(ts=k, count=counts[k]) for k in sorted(counts)]

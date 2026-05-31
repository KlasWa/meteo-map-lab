"""Aggregate hourly observations into hourly/daily/monthly points (UTC)."""

from datetime import datetime, timezone

from app.dto import ParsedObs
from app.schemas.cloud_cover import CloudPoint


def _day_key(ts_ms: int) -> int:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000)


def _month_key(ts_ms: int) -> int:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start = datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000)


def aggregate(obs: list[ParsedObs], resolution: str) -> list[CloudPoint]:
    if resolution == "hourly":
        return [
            CloudPoint(
                ts=o.ts_utc,
                value=o.cloud_pct,
                count=0 if o.cloud_pct is None else 1,
            )
            for o in obs
        ]

    key_fn = _day_key if resolution == "daily" else _month_key
    buckets: dict[int, list[float | None]] = {}
    for o in obs:
        buckets.setdefault(key_fn(o.ts_utc), []).append(o.cloud_pct)

    points: list[CloudPoint] = []
    for key in sorted(buckets):
        usable = [v for v in buckets[key] if v is not None]
        value = round(sum(usable) / len(usable), 2) if usable else None
        points.append(CloudPoint(ts=key, value=value, count=len(usable)))
    return points

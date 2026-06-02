"""Aggregate hourly observations into hourly/daily/monthly points (UTC)."""

from app.dto import ParsedObs
from app.schemas.cloud_cover import CloudPoint
from app.services.timebuckets import day_key, month_key


def aggregate(obs: list[ParsedObs], resolution: str) -> list[CloudPoint]:
    if resolution == "hourly":
        return [
            CloudPoint(
                ts=o.ts_utc,
                value=o.value,
                count=0 if o.value is None else 1,
            )
            for o in obs
        ]

    key_fn = day_key if resolution == "daily" else month_key
    buckets: dict[int, list[float | None]] = {}
    for o in obs:
        buckets.setdefault(key_fn(o.ts_utc), []).append(o.value)

    points: list[CloudPoint] = []
    for key in sorted(buckets):
        usable = [v for v in buckets[key] if v is not None]
        value = round(sum(usable) / len(usable), 2) if usable else None
        points.append(CloudPoint(ts=key, value=value, count=len(usable)))
    return points

"""UTC time-bucket keys (epoch ms of the bucket start). Shared by the cloud and
lightning aggregators."""

from datetime import datetime, timezone


def hour_key(ts_ms: int) -> int:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start = datetime(dt.year, dt.month, dt.day, dt.hour, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000)


def day_key(ts_ms: int) -> int:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000)


def month_key(ts_ms: int) -> int:
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    start = datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)
    return int(start.timestamp() * 1000)

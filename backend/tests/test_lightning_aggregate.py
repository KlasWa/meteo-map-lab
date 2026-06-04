from app.dto import StrikeRaw
from app.services.lightning_aggregate import aggregate_counts


def _strike(ts: int) -> StrikeRaw:
    return StrikeRaw(ts_utc=ts, lat=59.0, lon=18.0, peak_current=-5.0, cloud_indicator=0)


# three strikes on 2024-07-15, two within the same hour; one on 2024-07-16
H = 3600_000
DAY15 = 1721001600000  # 2024-07-15 00:00 UTC
DAY16 = 1721088000000  # 2024-07-16 00:00 UTC


def test_counts_per_day():
    strikes = [_strike(DAY15 + H), _strike(DAY15 + 2 * H), _strike(DAY16 + H)]
    points = aggregate_counts(strikes, "daily")
    assert [(p.ts, p.count) for p in points] == [(DAY15, 2), (DAY16, 1)]


def test_counts_per_hour():
    strikes = [_strike(DAY15 + H + 60_000), _strike(DAY15 + H + 120_000)]
    points = aggregate_counts(strikes, "hourly")
    assert [(p.ts, p.count) for p in points] == [(DAY15 + H, 2)]


def test_empty():
    assert aggregate_counts([], "monthly") == []

from app.dto import ParsedObs
from app.services.aggregate import aggregate

# 2025-01-01 00:00, 12:00 UTC and 2025-01-02 00:00 UTC
T_JAN1_00 = 1735689600000
T_JAN1_12 = 1735732800000
T_JAN2_00 = 1735776000000


def test_hourly_passthrough_with_count():
    obs = [ParsedObs(T_JAN1_00, 80.0, "G"), ParsedObs(T_JAN1_12, None, "G")]
    points = aggregate(obs, "hourly")
    assert [p.ts for p in points] == [T_JAN1_00, T_JAN1_12]
    assert points[0].value == 80.0 and points[0].count == 1
    assert points[1].value is None and points[1].count == 0


def test_daily_mean_excludes_none():
    obs = [
        ParsedObs(T_JAN1_00, 100.0, "G"),
        ParsedObs(T_JAN1_12, 50.0, "G"),
        ParsedObs(T_JAN2_00, None, "G"),
    ]
    points = aggregate(obs, "daily")
    assert len(points) == 2
    assert points[0].value == 75.0 and points[0].count == 2
    assert points[1].value is None and points[1].count == 0
    # bucket ts is UTC midnight of that day
    assert points[0].ts == T_JAN1_00
    assert points[1].ts == T_JAN2_00


def test_monthly_mean_buckets_to_first_of_month():
    obs = [ParsedObs(T_JAN1_00, 40.0, "G"), ParsedObs(T_JAN2_00, 60.0, "G")]
    points = aggregate(obs, "monthly")
    assert len(points) == 1
    assert points[0].value == 50.0 and points[0].count == 2
    assert points[0].ts == T_JAN1_00  # 2025-01-01 00:00 UTC

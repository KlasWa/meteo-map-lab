from app.services.timebuckets import day_key, hour_key, month_key

# 2024-07-15 13:37:00 UTC = 1721050620000 ms
TS = 1721050620000


def test_hour_key_floors_to_hour():
    # 2024-07-15 13:00:00 UTC
    assert hour_key(TS) == 1721048400000


def test_day_key_floors_to_utc_midnight():
    # 2024-07-15 00:00:00 UTC
    assert day_key(TS) == 1721001600000


def test_month_key_floors_to_first_of_month():
    # 2024-07-01 00:00:00 UTC
    assert month_key(TS) == 1719792000000

from app.services.lightning_parse import parse_day


def _record(**over):
    base = {
        "year": 2024,
        "month": 7,
        "day": 15,
        "hours": 0,
        "minutes": 5,
        "seconds": 48,
        "nanoseconds": 951386624,
        "lat": 58.656,
        "lon": 17.2419,
        "peakCurrent": -6,
        "cloudIndicator": 1,
    }
    base.update(over)
    return base


def test_parse_day_builds_utc_timestamp_ms():
    obs = parse_day({"values": [_record()]})
    assert len(obs) == 1
    s = obs[0]
    # 2024-07-15 00:05:48 UTC = 1721001948000 ms, + 951ms from nanoseconds
    assert s.ts_utc == 1721001948000 + 951
    assert s.lat == 58.656
    assert s.lon == 17.2419
    assert s.peak_current == -6.0
    assert s.cloud_indicator == 1


def test_parse_day_skips_records_without_coords():
    obs = parse_day({"values": [_record(lat=None), _record()]})
    assert len(obs) == 1


def test_parse_day_empty_payload():
    assert parse_day({}) == []

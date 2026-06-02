from app.dto import StrikeRaw


def _s(ts, lat, lon):
    return StrikeRaw(ts_utc=ts, lat=lat, lon=lon, peak_current=-5.0, cloud_indicator=0)


def test_upsert_is_idempotent(lrepo):
    lrepo.upsert_strikes([_s(1000, 59.0, 18.0)])
    lrepo.upsert_strikes([_s(1000, 59.0, 18.0)])  # same ts/lat/lon -> no dup
    rows = lrepo.strikes_in_bbox(0.0, 90.0, 0.0, 90.0, 0, 2000)
    assert len(rows) == 1


def test_bbox_and_time_filter(lrepo):
    lrepo.upsert_strikes(
        [
            _s(1000, 59.0, 18.0),  # in box + time
            _s(1000, 10.0, 18.0),  # outside lat box
            _s(9999, 59.0, 18.0),  # outside time
        ]
    )
    rows = lrepo.strikes_in_bbox(58.0, 60.0, 17.0, 19.0, 0, 2000)
    assert len(rows) == 1
    assert rows[0].lat == 59.0


def test_day_ledger_record_and_get(lrepo):
    assert lrepo.get_day(86400000) is None
    lrepo.record_day(86400000, fetched_at=100, count=5)
    log = lrepo.get_day(86400000)
    assert log.count == 5 and log.fetched_at == 100
    lrepo.record_day(86400000, fetched_at=200, count=7)  # upsert in place
    log2 = lrepo.get_day(86400000)
    assert log2.count == 7 and log2.fetched_at == 200


def test_purge_clears_lightning(lrepo):
    lrepo.upsert_strikes([_s(1000, 59.0, 18.0)])
    lrepo.record_day(86400000, fetched_at=1, count=1)
    counts = lrepo.purge()
    assert counts == {"lightning_strikes": 1, "lightning_days": 1}
    assert lrepo.has_any_day() is False
    assert lrepo.strikes_in_bbox(0.0, 90.0, 0.0, 90.0, 0, 2000) == []


def test_purge_empty_lightning_returns_zeros(lrepo):
    assert lrepo.purge() == {"lightning_strikes": 0, "lightning_days": 0}

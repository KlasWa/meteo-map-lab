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


def test_upsert_many_strikes_batches_under_var_limit():
    # A busy day has tens of thousands of strikes; a single multi-row INSERT
    # exceeds SQLite's bound-variable limit. Cap the limit low (1500) to make the
    # crash deterministic regardless of host SQLite, and prove upsert batches.
    import sqlite3

    from sqlalchemy import event
    from sqlalchemy.pool import StaticPool
    from sqlmodel import SQLModel, create_engine

    from app.repositories.lightning_sqlite import SqliteLightningRepository

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _cap_vars(dbapi_conn, _rec):  # noqa: ANN001
        dbapi_conn.setlimit(sqlite3.SQLITE_LIMIT_VARIABLE_NUMBER, 1500)

    SQLModel.metadata.create_all(engine)
    repo = SqliteLightningRepository(engine)
    strikes = [_s(1000 + i, 59.0, 18.0) for i in range(5000)]  # 25k params total
    repo.upsert_strikes(strikes)
    rows = repo.strikes_in_bbox(0.0, 90.0, 0.0, 90.0, 0, 1_000_000)
    assert len(rows) == 5000

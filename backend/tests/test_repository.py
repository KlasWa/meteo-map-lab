from app.dto import ParsedObs, StationRaw


def _stations():
    return [
        StationRaw(id=1, name="Near", lat=59.0, lon=18.0, active=True),
        StationRaw(id=2, name="Far", lat=55.0, lon=13.0, active=True),
    ]


def test_upsert_stations_and_count(repo):
    repo.upsert_stations(_stations())
    assert repo.station_count() == 2
    # Idempotent upsert: same ids, updated name
    repo.upsert_stations([StationRaw(id=1, name="Renamed", lat=59.0, lon=18.0, active=True)])
    assert repo.station_count() == 2


def test_nearest_station_picks_closest(repo):
    repo.upsert_stations(_stations())
    nearest = repo.nearest_station(59.1, 18.1, max_km=150.0)
    assert nearest is not None
    assert nearest.id == 1


def test_nearest_station_respects_max_km(repo):
    repo.upsert_stations(_stations())
    assert repo.nearest_station(0.0, 0.0, max_km=150.0) is None


def test_nearest_station_skips_inactive(repo):
    # A closed station (active=False) has no latest-months data on SMHI, so it
    # would 404 on fetch_recent. nearest_station must skip it even when it is
    # geographically closer than an active one.
    repo.upsert_stations(
        [
            StationRaw(id=1, name="Closed", lat=59.0, lon=18.0, active=False),
            StationRaw(id=2, name="Open", lat=59.2, lon=18.2, active=True),
        ]
    )
    nearest = repo.nearest_station(59.0, 18.0, max_km=150.0)
    assert nearest is not None
    assert nearest.id == 2


def test_upsert_observations_dedupes_on_station_ts(repo):
    repo.upsert_stations(_stations())
    repo.upsert_observations(1, [ParsedObs(1000, 50.0, "Y")])
    # Same (station, ts) again with a corrected value -> overwrite, not duplicate
    repo.upsert_observations(1, [ParsedObs(1000, 60.0, "G")])
    rows = repo.get_observations(1, 0, 2000)
    assert len(rows) == 1
    assert rows[0].value == 60.0
    assert rows[0].quality == "G"


def test_get_observations_filters_range_and_sorts(repo):
    repo.upsert_stations(_stations())
    repo.upsert_observations(
        1,
        [
            ParsedObs(3000, 30.0, "G"),
            ParsedObs(1000, 10.0, "G"),
            ParsedObs(5000, 50.0, "G"),
        ],
    )
    rows = repo.get_observations(1, 1000, 3000)
    assert [r.ts_utc for r in rows] == [1000, 3000]


def test_fetch_log_record_and_get(repo):
    assert repo.get_fetch_log(1, "recent") is None
    repo.record_fetch(1, "recent", fetched_at=100, covered_from=10, covered_to=90)
    log = repo.get_fetch_log(1, "recent")
    assert log.fetched_at == 100
    # Re-record updates in place (no duplicate row)
    repo.record_fetch(1, "recent", fetched_at=200, covered_from=10, covered_to=190)
    log2 = repo.get_fetch_log(1, "recent")
    assert log2.fetched_at == 200


def test_param_isolates_stations_and_observations(repo):
    # Same station id reporting two params, with different active status.
    repo.upsert_stations(
        [StationRaw(id=1, name="S16", lat=59.0, lon=18.0, active=True)], param=16
    )
    repo.upsert_stations(
        [StationRaw(id=1, name="S29", lat=59.0, lon=18.0, active=True)], param=29
    )
    repo.upsert_observations(1, [ParsedObs(1000, 50.0, "G")], param=16)
    repo.upsert_observations(1, [ParsedObs(1000, 7.0, "G")], param=29)

    assert repo.station_count(param=16) == 1
    assert repo.station_count(param=29) == 1
    obs16 = repo.get_observations(1, 0, 2000, param=16)
    obs29 = repo.get_observations(1, 0, 2000, param=29)
    assert obs16[0].value == 50.0
    assert obs29[0].value == 7.0


def test_nearest_station_isolates_by_param(repo):
    repo.upsert_stations(
        [StationRaw(id=1, name="Only16", lat=59.0, lon=18.0, active=True)], param=16
    )
    # No param-29 station -> nearest_station(param=29) finds nothing.
    assert repo.nearest_station(59.0, 18.0, max_km=150.0, param=29) is None
    assert repo.nearest_station(59.0, 18.0, max_km=150.0, param=16).id == 1


def test_record_fetch_upserts_without_duplicate(repo):
    # record_fetch must upsert on (param, station_id, kind): recording the same
    # key twice updates in place rather than inserting a duplicate row (which a
    # select-then-insert would do under concurrency -> UNIQUE constraint failed).
    repo.record_fetch(0, "station_list", fetched_at=100, covered_from=None, covered_to=None)
    repo.record_fetch(0, "station_list", fetched_at=200, covered_from=10, covered_to=90)
    log = repo.get_fetch_log(0, "station_list")
    assert log.fetched_at == 200
    assert log.covered_from == 10
    assert log.covered_to == 90


def test_fetch_log_isolated_by_param(repo):
    repo.record_fetch(1, "recent", fetched_at=100, covered_from=10, covered_to=90, param=16)
    assert repo.get_fetch_log(1, "recent", param=29) is None
    log = repo.get_fetch_log(1, "recent", param=16)
    assert log.fetched_at == 100

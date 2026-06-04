"""SQL-side aggregation tests. Exercises SqliteRepository against an
in-memory database so the real strftime / GROUP BY paths run."""

from datetime import datetime, timezone

from app.dto import ParsedObs


def _ms(year, month, day, hour=0):
    return int(datetime(year, month, day, hour, tzinfo=timezone.utc).timestamp() * 1000)


def _seed(repo, station_id, param, obs):
    repo.upsert_observations(station_id, obs, param=param)


def test_hourly_returns_one_point_per_observation(repo):
    obs = [
        ParsedObs(_ms(2026, 5, 1, 0), 10.0, "G"),
        ParsedObs(_ms(2026, 5, 1, 1), 20.0, "G"),
        ParsedObs(_ms(2026, 5, 1, 2), None, "R"),
    ]
    _seed(repo, station_id=1, param=16, obs=obs)

    points = repo.aggregate_observations(
        station_id=1,
        start_ts=_ms(2026, 5, 1, 0),
        end_ts=_ms(2026, 5, 1, 23),
        resolution="hourly",
        param=16,
    )

    assert [p.ts for p in points] == [_ms(2026, 5, 1, 0), _ms(2026, 5, 1, 1), _ms(2026, 5, 1, 2)]
    assert [p.value for p in points] == [10.0, 20.0, None]
    assert [p.count for p in points] == [1, 1, 0]


def test_daily_means_drop_indeterminate_values(repo):
    obs = [
        ParsedObs(_ms(2026, 5, 1, 0), 20.0, "G"),
        ParsedObs(_ms(2026, 5, 1, 12), 40.0, "G"),
        ParsedObs(_ms(2026, 5, 1, 18), None, "R"),  # indeterminate, dropped from mean
        ParsedObs(_ms(2026, 5, 2, 0), 10.0, "G"),
    ]
    _seed(repo, station_id=1, param=16, obs=obs)

    points = repo.aggregate_observations(
        station_id=1,
        start_ts=_ms(2026, 5, 1, 0),
        end_ts=_ms(2026, 5, 2, 23),
        resolution="daily",
        param=16,
    )

    assert [p.ts for p in points] == [_ms(2026, 5, 1), _ms(2026, 5, 2)]
    assert points[0].value == 30.0  # (20 + 40) / 2
    assert points[0].count == 2
    assert points[1].value == 10.0
    assert points[1].count == 1


def test_monthly_buckets_round_to_first_of_month(repo):
    obs = [
        ParsedObs(_ms(2026, 5, 3, 12), 50.0, "G"),
        ParsedObs(_ms(2026, 5, 28, 0), 70.0, "G"),
        ParsedObs(_ms(2026, 6, 1, 0), 30.0, "G"),
    ]
    _seed(repo, station_id=1, param=16, obs=obs)

    points = repo.aggregate_observations(
        station_id=1,
        start_ts=_ms(2026, 1, 1),
        end_ts=_ms(2026, 12, 31, 23),
        resolution="monthly",
        param=16,
    )

    assert [p.ts for p in points] == [_ms(2026, 5, 1), _ms(2026, 6, 1)]
    assert points[0].value == 60.0  # (50 + 70) / 2
    assert points[1].value == 30.0


def test_empty_window_returns_empty(repo):
    obs = [ParsedObs(_ms(2026, 5, 1, 0), 10.0, "G")]
    _seed(repo, station_id=1, param=16, obs=obs)

    points = repo.aggregate_observations(
        station_id=1,
        start_ts=_ms(2026, 6, 1),
        end_ts=_ms(2026, 6, 30),
        resolution="daily",
        param=16,
    )

    assert points == []


def test_only_indeterminate_yields_bucket_with_null_value(repo):
    obs = [
        ParsedObs(_ms(2026, 5, 1, 0), None, "R"),
        ParsedObs(_ms(2026, 5, 1, 12), None, "R"),
    ]
    _seed(repo, station_id=1, param=16, obs=obs)

    points = repo.aggregate_observations(
        station_id=1,
        start_ts=_ms(2026, 5, 1),
        end_ts=_ms(2026, 5, 31),
        resolution="daily",
        param=16,
    )

    assert len(points) == 1
    assert points[0].value is None
    assert points[0].count == 0


def test_param_isolation(repo):
    # Same station+timestamp, two different params — only the queried param contributes.
    repo.upsert_observations(1, [ParsedObs(_ms(2026, 5, 1, 0), 100.0, "G")], param=16)
    repo.upsert_observations(1, [ParsedObs(_ms(2026, 5, 1, 0), 8.0, "G")], param=29)

    p16 = repo.aggregate_observations(1, _ms(2026, 5, 1), _ms(2026, 5, 31), "daily", param=16)
    p29 = repo.aggregate_observations(1, _ms(2026, 5, 1), _ms(2026, 5, 31), "daily", param=29)

    assert p16[0].value == 100.0
    assert p29[0].value == 8.0


def test_combined_picks_per_timestamp_max_across_layers(repo):
    # Two layers reporting at the same ts: combined should keep the larger value.
    repo.upsert_observations(1, [ParsedObs(_ms(2026, 5, 1, 0), 3.0, "G")], param=29)
    repo.upsert_observations(1, [ParsedObs(_ms(2026, 5, 1, 0), 5.0, "G")], param=31)
    repo.upsert_observations(1, [ParsedObs(_ms(2026, 5, 1, 0), 4.0, "G")], param=33)

    points = repo.aggregate_combined_observations(
        station_id=1,
        start_ts=_ms(2026, 5, 1),
        end_ts=_ms(2026, 5, 31),
        resolution="daily",
        params=[29, 31, 33],
    )

    assert len(points) == 1
    assert points[0].value == 5.0


def test_combined_skips_bucket_when_all_layers_indeterminate(repo):
    repo.upsert_observations(1, [ParsedObs(_ms(2026, 5, 1, 0), None, "R")], param=29)
    repo.upsert_observations(1, [ParsedObs(_ms(2026, 5, 1, 0), None, "R")], param=31)

    points = repo.aggregate_combined_observations(
        station_id=1,
        start_ts=_ms(2026, 5, 1),
        end_ts=_ms(2026, 5, 31),
        resolution="daily",
        params=[29, 31],
    )

    assert points == []


def test_combined_empty_params_returns_empty(repo):
    points = repo.aggregate_combined_observations(
        station_id=1,
        start_ts=_ms(2026, 5, 1),
        end_ts=_ms(2026, 5, 31),
        resolution="daily",
        params=[],
    )
    assert points == []


def test_unknown_resolution_raises(repo):
    import pytest

    with pytest.raises(ValueError, match="unknown resolution"):
        repo.aggregate_observations(1, 0, 1, "yearly", param=16)

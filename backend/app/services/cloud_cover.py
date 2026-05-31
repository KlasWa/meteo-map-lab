"""Orchestrates SMHI fetching, caching, and aggregation for cloud cover."""

import time
from threading import Lock

import httpx

from app.repositories.base import CacheRepository
from app.schemas.cloud_cover import CloudCoverResponse, StationInfo
from app.services.aggregate import aggregate
from app.services.geo import haversine_km
from app.services.smhi import SMHIClient
from app.services.smhi_parse import parse_archive_csv, parse_recent_json

ARCHIVE = "archive"
RECENT = "recent"
STATION_LIST = "station_list"
_STATION_LIST_ID = 0
_MONTH_MS = 30 * 24 * 3600 * 1000
_YEAR_MS = 365 * 24 * 3600 * 1000


class NoStationFound(Exception):
    """No station within the configured radius of the coordinate."""


class SMHIUnavailable(Exception):
    """SMHI could not be reached and no usable cached data exists."""


def _min_ts(obs):
    return min((o.ts_utc for o in obs), default=None)


def _max_ts(obs):
    return max((o.ts_utc for o in obs), default=None)


class CloudCoverService:
    def __init__(
        self,
        client: SMHIClient,
        repo: CacheRepository,
        settings,
    ) -> None:
        self.client = client
        self.repo = repo
        self.recent_ttl_ms = settings.recent_ttl_seconds * 1000
        self.station_list_ttl_ms = settings.station_list_ttl_days * 24 * 3600 * 1000
        self.history_ms = settings.history_months * _MONTH_MS
        self.nearest_max_km = settings.nearest_max_km
        self._locks: dict[int, Lock] = {}
        self._locks_guard = Lock()

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def _lock_for(self, station_id: int) -> Lock:
        with self._locks_guard:
            lock = self._locks.get(station_id)
            if lock is None:
                lock = Lock()
                self._locks[station_id] = lock
            return lock

    def ensure_station_list(self, now_ms: int) -> None:
        log = self.repo.get_fetch_log(_STATION_LIST_ID, STATION_LIST)
        fresh = log is not None and now_ms - log.fetched_at <= self.station_list_ttl_ms
        if fresh:
            return
        try:
            stations = self.client.fetch_station_list()
        except httpx.HTTPError as exc:
            if self.repo.station_count() == 0:
                raise SMHIUnavailable(str(exc)) from exc
            return  # keep using the existing (stale) list
        self.repo.upsert_stations(stations)
        self.repo.record_fetch(_STATION_LIST_ID, STATION_LIST, now_ms, None, None)

    def ensure_cached(self, station_id: int, now_ms: int) -> None:
        # Recent window: refresh when missing or older than TTL.
        recent_log = self.repo.get_fetch_log(station_id, RECENT)
        if recent_log is None or now_ms - recent_log.fetched_at > self.recent_ttl_ms:
            try:
                payload = self.client.fetch_recent(station_id)
            except httpx.HTTPError as exc:
                raise SMHIUnavailable(str(exc)) from exc
            obs = parse_recent_json(payload)
            self.repo.upsert_observations(station_id, obs)
            self.repo.record_fetch(station_id, RECENT, now_ms, _min_ts(obs), _max_ts(obs))

        # Archive: fetch once, then never again (immutable).
        archive_log = self.repo.get_fetch_log(station_id, ARCHIVE)
        if archive_log is None:
            try:
                text = self.client.fetch_archive(station_id)
            except httpx.HTTPError as exc:
                raise SMHIUnavailable(str(exc)) from exc
            cutoff = now_ms - self.history_ms
            obs = [o for o in parse_archive_csv(text) if o.ts_utc >= cutoff]
            self.repo.upsert_observations(station_id, obs)
            self.repo.record_fetch(station_id, ARCHIVE, now_ms, _min_ts(obs), _max_ts(obs))

    def get_cloud_cover(
        self,
        lat: float,
        lon: float,
        resolution: str,
        now_ms: int | None = None,
    ) -> CloudCoverResponse:
        now_ms = now_ms if now_ms is not None else self._now_ms()
        self.ensure_station_list(now_ms)

        station = self.repo.nearest_station(lat, lon, self.nearest_max_km)
        if station is None:
            raise NoStationFound(
                f"No SMHI station within {self.nearest_max_km} km of ({lat}, {lon})."
            )

        stale = False
        with self._lock_for(station.id):
            try:
                self.ensure_cached(station.id, now_ms)
            except SMHIUnavailable:
                stale = True

        obs = self.repo.get_observations(station.id, now_ms - _YEAR_MS, now_ms)
        if not obs and stale:
            raise SMHIUnavailable("SMHI is unavailable and no cached data exists for this station.")

        points = aggregate(obs, resolution)
        distance = haversine_km(lat, lon, station.lat, station.lon)
        return CloudCoverResponse(
            station=StationInfo(
                id=station.id,
                name=station.name,
                lat=station.lat,
                lon=station.lon,
                distance_km=round(distance, 2),
            ),
            resolution=resolution,
            stale=stale,
            points=points,
        )

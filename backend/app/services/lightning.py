"""Orchestrates lightning fetching, caching, and aggregation.

Day-files are national and immutable for past days, so each is fetched once and
reused for every location. Missing days are fetched concurrently (network only);
all DB writes happen on the calling thread to avoid SQLite write contention."""

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from math import cos, radians
from threading import Lock

from app.dto import StrikeRaw
from app.repositories.lightning_base import LightningRepository
from app.schemas.lightning import LightningCenter, LightningResponse
from app.services import lightning_risk
from app.services.geo import haversine_km
from app.services.lightning_aggregate import aggregate_counts
from app.services.lightning_client import LightningClient
from app.services.lightning_parse import parse_day
from app.services.timebuckets import day_key

_DAY_MS = 24 * 3600 * 1000
_MONTH_MS = 30 * _DAY_MS
_KM_PER_DEG_LAT = 111.0


@dataclass(frozen=True)
class DensityResult:
    n_g: float  # flashes/km^2/yr
    ground_flash_count: int
    total_flash_count: int
    span_years: float
    radius_km: float
    stale: bool


class LightningUnavailable(Exception):
    """SMHI could not be reached and no cached strikes exist."""


class LightningService:
    def __init__(
        self,
        client: LightningClient,
        repo: LightningRepository,
        settings,
    ) -> None:
        self.client = client
        self.repo = repo
        self.radius_km = settings.lightning_radius_km
        self.history_ms = settings.lightning_history_months * _MONTH_MS
        self.history_months = settings.lightning_history_months
        self.recent_ttl_ms = settings.lightning_recent_ttl_seconds * 1000
        self.workers = settings.lightning_fetch_workers
        self._lock = Lock()

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def _day_starts(self, start_ms: int, now_ms: int) -> list[int]:
        first = day_key(start_ms)
        last = day_key(now_ms)
        return list(range(first, last + _DAY_MS, _DAY_MS))

    def _fetch_day(self, day_start_ms: int):
        """Network + parse only (runs in worker threads). Returns
        (day_start_ms, strikes, ok). Any failure (network or malformed payload)
        degrades that day to ok=False so a single bad file can't abort the batch."""
        dt = datetime.fromtimestamp(day_start_ms / 1000, tz=timezone.utc)
        try:
            payload = self.client.fetch_day(dt.year, dt.month, dt.day)
            strikes = parse_day(payload)
        except Exception:
            return (day_start_ms, [], False)
        return (day_start_ms, strikes, True)

    def ensure_days(self, day_starts: list[int], now_ms: int) -> bool:
        """Fetch any missing/stale days. Returns True if some fetch failed
        (stale). DB writes happen here on the calling thread."""
        today = day_key(now_ms)
        final_before = today - _DAY_MS  # today and yesterday are non-final
        to_fetch: list[int] = []
        for ds in day_starts:
            log = self.repo.get_day(ds)
            if log is None:
                to_fetch.append(ds)
            elif ds >= final_before and now_ms - log.fetched_at > self.recent_ttl_ms:
                to_fetch.append(ds)
        if not to_fetch:
            return False

        with ThreadPoolExecutor(max_workers=self.workers) as ex:
            results = list(ex.map(self._fetch_day, to_fetch))

        stale = False
        for ds, strikes, ok in results:
            if ok:
                self.repo.upsert_strikes(strikes)
                self.repo.record_day(ds, now_ms, len(strikes))
            else:
                stale = True
        return stale

    def _strikes_within(
        self, lat: float, lon: float, start_ms: int, now_ms: int
    ) -> tuple[list[StrikeRaw], bool]:
        """Ensure the window is cached, then return (strikes within radius_km of
        the point, stale). Shared by get_lightning and ground_flash_density."""
        day_starts = self._day_starts(start_ms, now_ms)
        with self._lock:
            stale = self.ensure_days(day_starts, now_ms)

        lat_delta = self.radius_km / _KM_PER_DEG_LAT
        lon_delta = self.radius_km / (_KM_PER_DEG_LAT * max(cos(radians(lat)), 0.01))
        candidates = self.repo.strikes_in_bbox(
            lat - lat_delta,
            lat + lat_delta,
            lon - lon_delta,
            lon + lon_delta,
            start_ms,
            now_ms,
        )
        within = [
            s for s in candidates if haversine_km(lat, lon, s.lat, s.lon) <= self.radius_km
        ]
        return within, stale

    def get_lightning(
        self,
        lat: float,
        lon: float,
        resolution: str,
        now_ms: int | None = None,
    ) -> LightningResponse:
        now_ms = now_ms if now_ms is not None else self._now_ms()
        start_ms = now_ms - self.history_ms

        within, stale = self._strikes_within(lat, lon, start_ms, now_ms)
        if stale and not self.repo.has_any_day():
            raise LightningUnavailable("SMHI lightning is unavailable and nothing is cached.")

        return LightningResponse(
            center=LightningCenter(lat=lat, lon=lon),
            radius_km=self.radius_km,
            resolution=resolution,
            stale=stale,
            points=aggregate_counts(within, resolution),
        )

    def ground_flash_density(
        self, lat: float, lon: float, now_ms: int | None = None
    ) -> DensityResult:
        """Empirical ground flash density N_G from cached strikes around the
        point: ground flashes (cloud_indicator == 0) within radius_km, over the
        retained window, annualized. Raises LightningUnavailable when SMHI is
        down and nothing is cached (mirrors get_lightning)."""
        now_ms = now_ms if now_ms is not None else self._now_ms()
        start_ms = now_ms - self.history_ms

        within, stale = self._strikes_within(lat, lon, start_ms, now_ms)
        if stale and not self.repo.has_any_day():
            raise LightningUnavailable("SMHI lightning is unavailable and nothing is cached.")

        total = len(within)
        ground = sum(1 for s in within if s.cloud_indicator == 0)
        span_years = self.history_months / 12
        n_g = lightning_risk.ground_flash_density(ground, self.radius_km, span_years)
        return DensityResult(
            n_g=n_g,
            ground_flash_count=ground,
            total_flash_count=total,
            span_years=span_years,
            radius_km=self.radius_km,
            stale=stale,
        )

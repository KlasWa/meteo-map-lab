# SMHI Lightning Strikes — Design

Date: 2026-06-01
Status: Approved

## Goal

Fetch, cache, aggregate, and chart SMHI lightning-strike data for a selected
location, "in the same fashion" as the existing cloud-cover feature: lazy/TTL
caching, hourly/daily/monthly aggregation over the past ~12 months, and a chart
in the frontend. Lightning is shown on its **own chart below** the cloud chart,
driven by the same resolution + period controls.

## SMHI Lightning Open Data — what we're integrating

- Base: `https://opendata-download-lightning.smhi.se/api/version/latest/`
- **National point-event data, not station-based.** One dataset for all of
  Sweden; each record is an individual strike.
- Archive organized by day, immutable for past days, 2012→present:
  `…/year/{Y}/month/{M}/day/{D}/data.json`.
- A strike record's relevant fields: `year, month, day, hours, minutes,
  seconds, nanoseconds` (UTC), `lat`, `lon`, `peakCurrent` (kA; sign =
  polarity), `cloudIndicator` (cloud vs ground flash), `multiplicity`.
- Volume: a summer day = thousands of strikes nationally; winter days ≈ 0.
- Licence: CC BY 4.0.

## Decisions (locked during brainstorming)

1. **Region = fixed radius.** Count strikes within `lightning_radius_km`
   (default 50 km) of the selected point. No UI radius control (YAGNI).
2. **Metric = strike count** per time bucket (one series).
3. **Coverage = last 12 months, lazy.** Day-files fetched on demand for the
   retained window; cached forever (immutable past days) and reused across all
   locations. First cold request is slow; warmed cache is instant.
4. **Approach A — store raw strikes, filter at query time.** Persist individual
   strikes; compute bbox + radius and bucket-count at request time. Maximizes
   reuse across arbitrary points/radii. (Rejected: per-region pre-aggregates;
   no-cache per-request fetch.)
5. **UI = separate bar chart** below the cloud chart, sharing the resolution and
   period controls.

## Data Model

Same `meteo_map_lab.db` (regenerable cache; recreate with `make reset-db`). New
tables, separate from the cloud tables.

- **`LightningStrike`**
  - `id: int | None` PK (autoincrement)
  - `ts_utc: int` epoch ms, UTC — indexed
  - `lat: float` — indexed (bbox prefilter)
  - `lon: float`
  - `peak_current: float` (kA; stored for possible future use)
  - `cloud_indicator: int` (0/1; stored for possible future type split)
  - Unique constraint `(ts_utc, lat, lon)` to make re-ingesting a day
    idempotent (`uq_strike_ts_lat_lon`).
- **`LightningDay`** (fetch ledger)
  - `day_start_ms: int` PK — UTC midnight of the day, epoch ms
  - `fetched_at: int` epoch ms
  - `count: int` — strikes ingested for that day (0 for empty days)

A day is **final** (fetch once, never again) when its date is strictly before
`today - 1 day` (UTC). The current and previous UTC day are **non-final**.

Non-final days are cached exactly like final days (their strikes are stored and
a `LightningDay` ledger row is written), so within the TTL they are served from
cache with no fetch. The only difference: a non-final day is **re-fetched** when
its ledger row is older than `lightning_recent_ttl_seconds` (today's file is
still growing / late-arriving strikes). A re-fetch is an **idempotent append** —
`upsert_strikes` uses `ON CONFLICT DO NOTHING` on `(ts_utc, lat, lon)`, so newly
arrived strikes are added while already-cached ones are no-ops (no duplicates,
no double-counting) — and the ledger's `count` + `fetched_at` are updated.

`app/dto.py` gains `StrikeRaw` (storage-agnostic): `ts_utc, lat, lon,
peak_current, cloud_indicator`.

**Time representation:** all timestamps are stored and served as UTC **epoch
milliseconds (`int`)**, consistent with the cloud-cover feature and the shared
`timebuckets` / `formatLabel` helpers, and chosen for unambiguous, fast SQLite
range comparisons on the bbox+time hot path. Timezone-aware UTC `datetime`s are
used only internally at the boundaries — parsing strike fields into ms, and
computing hour/day/month bucket starts — so there are no naive datetimes
anywhere; only the stored/wire format is an integer.

## Backend Components

Parallel to the cloud components, kept separate by responsibility.

- **`app/services/lightning_client.py`** — `LightningClient(base_url, timeout,
  transport=None)` with `fetch_day(year, month, day) -> list[dict]`. Builds
  `…/year/{y}/month/{m}/day/{d}/data.json`, returns the `values` list. A 404 is
  treated as "no data for that day" → `[]` (raise on other HTTP errors).
- **`app/services/lightning_parse.py`** — `parse_day(payload: dict) ->
  list[StrikeRaw]`. Builds `ts_utc` from `year…seconds` plus `nanoseconds`
  (ms = `nanoseconds // 1_000_000`), UTC. Skips records missing lat/lon.
- **`app/services/timebuckets.py`** (shared) — `hour_key`, `day_key`,
  `month_key` (epoch-ms bucket starts, UTC). The cloud `aggregate.py` is
  refactored to import these (removing its private `_day_key`/`_month_key`).
- **`app/services/lightning_aggregate.py`** — `aggregate_counts(strikes:
  list[StrikeRaw], resolution: str) -> list[LightningPoint]`. Buckets strikes by
  the chosen resolution and counts them; buckets with zero strikes are simply
  absent (the chart shows gaps / no bar).
- **`app/repositories/lightning_base.py`** — `LightningRepository` (ABC):
  - `upsert_strikes(strikes: list[StrikeRaw]) -> None`
  - `get_day(day_start_ms: int) -> LightningDay | None`
  - `record_day(day_start_ms: int, fetched_at: int, count: int) -> None`
  - `strikes_in_bbox(min_lat, max_lat, min_lon, max_lon, start_ts, end_ts) ->
    list[StrikeRaw]`
- **`app/repositories/lightning_sqlite.py`** — `SqliteLightningRepository`
  implementing the ABC. `upsert_strikes` uses
  `on_conflict_do_nothing` on the unique constraint. `strikes_in_bbox` filters
  by `ts_utc` range and lat/lon bbox.
- **`app/services/lightning.py`** — `LightningService`:
  - `NoLightningData` is not needed (empty is valid); `LightningUnavailable`
    (SMHI unreachable and no cache) mirrors `SMHIUnavailable`.
  - `get_lightning(lat, lon, resolution, now_ms=None) -> LightningResponse`:
    1. window = `[now - history_ms, now]`; enumerate the UTC day starts in it.
    2. `ensure_days(day_starts, now_ms)`: for each day not cached (or non-final
       & stale), fetch+parse+`upsert_strikes`+`record_day`. Fetch missing days
       **concurrently** via a bounded `ThreadPoolExecutor`
       (`lightning_fetch_workers`, default 8). A process-wide lock serializes
       the ensure step so concurrent requests don't double-fetch; a failed day
       fetch marks `stale = True` rather than aborting (unless nothing is
       cached at all → `LightningUnavailable`).
    3. bbox = box around (lat, lon) sized by `radius_km` (lat/lon degree deltas);
       `strikes_in_bbox(...)` then haversine-filter to `<= radius_km` (reusing
       `app/services/geo.haversine_km`).
    4. `aggregate_counts(filtered, resolution)`.
    5. return `LightningResponse`.
- **`app/schemas/lightning.py`**
  - `LightningPoint { ts: int, count: int }`
  - `LightningCenter { lat: float, lon: float }`
  - `LightningResponse { center: LightningCenter, radius_km: float,
    resolution: str, unit: str = "strikes", stale: bool = False,
    attribution: str = "Data: SMHI (CC BY 4.0)", points: list[LightningPoint] }`
- **`app/api/routes.py`** — `GET /api/lightning?lat&lon&resolution=` with
  `resolution: Literal["hourly","daily","monthly"] = "daily"`. Builds a
  process-wide `LightningService` via `lru_cache` (like the cloud one).
  `LightningUnavailable → 503`. No strikes → 200 with empty `points`.
- **Settings** (`app/core/config.py`): `lightning_base_url`,
  `lightning_radius_km: float = 50.0`, `lightning_history_months: int = 12`,
  `lightning_recent_ttl_seconds: int = 3600`,
  `lightning_fetch_workers: int = 8`.

## Cold-start handling

The first request against an empty cache must fetch up to ~365 national
day-files. Most are tiny/empty (lightning is summer-only). Mitigations:

- Fetch missing days concurrently (`ThreadPoolExecutor`, ~8 workers).
- The ensure step is reused across **all** locations, so the cache warms once
  globally.
- A `make ingest-lightning` target calls a small script that warms the cache
  (iterates the 12-month window via the service) so the slow fetch can be done
  deliberately rather than on a user's first request.

This is the main performance risk and is called out explicitly so the plan
covers it (concurrency, the lock, and the warm-up target).

## Frontend

- `frontend/src/lib/api.ts` — `getLightning(lat, lon, resolution): Promise<
  Lightning>`; types regenerated from the OpenAPI schema (`make gen-api`).
- `frontend/src/components/LightningChart.tsx` — a Chart.js **bar** chart of
  strike counts per bucket (single series, the theme's primary color), reusing
  the same UTC time-label formatting as the cloud chart (the `formatLabel`
  helper is extracted to a shared module and imported by both).
- `frontend/src/App.tsx` — fetch lightning in parallel with the cloud params on
  selection/resolution change; render `LightningChart` in its own block below
  the cloud chart, with a small heading ("Lightning — strikes within 50 km")
  and its own loading / empty ("No lightning recorded in this period") states.
  The existing client-side **period filter** (resolution-aware ranges) applies
  to the lightning points too. The bar chart sits in its own `max-w-[600px]`
  box (height can differ from 2:1; e.g. a shorter bar panel).

## Testing

- **lightning_client**: mock transport asserts the day URL; 404 → `[]`; other
  HTTP error raises.
- **lightning_parse**: timestamp built correctly from y/m/d/h/m/s+nanos (UTC);
  missing lat/lon skipped.
- **timebuckets**: hour/day/month keys; cloud aggregate still passes after the
  refactor.
- **lightning_aggregate**: counts per bucket; empty input → `[]`.
- **lightning repository**: `upsert_strikes` idempotent (same ts/lat/lon not
  duplicated); `strikes_in_bbox` filters by bbox + ts; ledger record/get.
- **lightning service**: lazy `ensure_days` fetches only missing days; radius
  filter excludes strikes outside the radius but inside the bbox; stale-serve
  when a day fetch fails but cache exists; `LightningUnavailable` when cold and
  SMHI down. Inject `now_ms` and a fake client for determinism.
- **endpoint**: `/api/lightning` returns counts + `unit:"strikes"`; invalid
  resolution → 422; 503 path.
- **frontend**: typecheck + lint + build; the bar chart renders with data.

## Out of Scope

- No type split (ground vs cloud) or intensity series — `cloud_indicator` and
  `peak_current` are stored but unused for now.
- No user-adjustable radius UI.
- No scheduled background refresh (a manual `make ingest-lightning` is provided
  instead).
- No overlay of lightning onto the cloud chart (separate chart only).

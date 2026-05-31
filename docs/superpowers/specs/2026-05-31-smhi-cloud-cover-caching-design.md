# SMHI Cloud-Cover Ingest & Cache — Design

> Status: approved (brainstorm). Date: 2026-05-31.
> Source brief: [`README-instructions.md`](../../../README-instructions.md) ·
> Architecture: [`ai-docs/PLANNING.md`](../../../ai-docs/PLANNING.md)

## 1. Scope & Goal

A backend **cloud-coverage ingest + cache layer** for elvy-map. Given a
coordinate, it resolves the nearest SMHI station, lazily fetches and caches
~13 months of hourly cloud cover, and serves it at hourly / daily / monthly
resolution.

**In scope**

- SMHI Open Data client for cloud cover (parameter 16, percent).
- Parsers for the corrected-archive CSV and the latest-months JSON.
- SQLite cache behind a swappable repository interface (SQLModel models +
  a fetch ledger).
- Lazy / on-demand ingest with a TTL refresh for the recent window.
- One read endpoint exposing hourly/daily/monthly series for a coordinate.

**Out of scope (later specs)**

- Charts / frontend wiring.
- Lightning-strike probability.
- Geocoding changes (the MapTiler control already provides coordinates).
- Scheduled / background refresh (the ingest function is written so a future
  job can call it).
- Multi-station "region" aggregation (this iteration uses the single nearest
  station).

## 2. Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Region model | Single nearest station | Simplest; one cache key per station. The map already yields a point. |
| Parameter | `16` "Total molnmängd", percent (0–100) | Total sky cover, hourly, percent is friendlier than octas (param 29). |
| Resolutions exposed | hourly, daily, monthly | Matches the project brief's day/month/year + monthly-over-a-year goal. |
| Aggregation | Backend, on the fly | Store raw hourly; derive daily/monthly per request (trivial at this scale). |
| Refresh trigger | Lazy / on-demand + TTL | No scheduler; load is naturally request-bounded. |
| Archive vs window | Split: archive once, window on TTL | Archive is QC'd and effectively immutable; only the recent window changes. |
| Storage | SQLite (SQLModel) behind a repository interface | Transactional upsert + ledger in one place; swappable for Parquet/DuckDB later. |
| History bound | ~13 months | User wants "a year back"; avoids storing SMHI's multi-decade archive. |
| Recent TTL | 1 hour | Matches SMHI's hourly update cadence. |

## 3. SMHI Facts That Shape This Design

(From research against the live API, 2026-05-31.)

- **Base:** `https://opendata-download-metobs.smhi.se/api`, version `1.0`.
  Discovery: version → parameter → station → period → data.
- **Cloud-cover parameter `16`** ("Total molnmängd"): **hourly**, unit
  **percent (0–100)**; special value **`113`** = cannot be determined
  (fog/precip). Octas variants exist (param 29) but percent is preferred.
- **No geo-query endpoint.** Fetch the full station list for param 16
  (`/parameter/16.json`, lat/lon per station) and pick the nearest
  client-side.
- **One year needs two periods spliced:**
  - `corrected-archive` — QC'd history, **CSV only**, excludes the last
    ~3 months, can reach back decades.
  - `latest-months` — rolling **~4 months**, available as **JSON**.
  - They overlap by ~1 month → **dedupe on `(station, timestamp)`**.
- **Formats:** archive is semicolon CSV with several metadata header blocks
  before the data rows (`Datum`, `Tid (UTC)`, value, `Kvalitet`); recent is
  JSON with `value` as a **string** and `date` as **epoch-ms UTC**.
- **Quality codes:** `G` (approved), `Y` (suspect/aggregated/uncontrolled),
  `R` (failed QC).
- **Usage policy:** no API key; **avoid mass downloads, cache aggressively,
  don't fetch faster than the hourly update**; license **CC BY 4.0**
  (attribution required).

Endpoint reference:

```
# Station list for parameter 16 (lat/lon per station)
/api/version/1.0/parameter/16.json

# Latest ~4 months, JSON
/api/version/1.0/parameter/16/station/{id}/period/latest-months/data.json

# Quality-controlled archive, CSV only
/api/version/1.0/parameter/16/station/{id}/period/corrected-archive/data.csv
```

## 4. Architecture & Components

```
API  →  CloudCoverService  →  SMHIClient (httpx)  →  SMHI Open Data
              │                     │
              │                     └─ parsers (CSV archive / JSON recent) → Observation[]
              ▼
        CacheRepository (interface)
              │
              └─ SqliteRepository  (SQLModel: Station, Observation, FetchLog)
```

- **`SMHIClient`** (`app/services/smhi.py`, replaces the current stub)
  - `fetch_station_list() -> list[StationRaw]`
  - `fetch_archive(station_id) -> str` (corrected-archive CSV body)
  - `fetch_recent(station_id) -> dict` (latest-months JSON)
  - httpx with explicit timeouts; sequential (single connection) for
    politeness; base URL from `settings.smhi_base_url`.
- **Parsers** (`app/services/smhi_parse.py`)
  - `parse_archive_csv(text) -> list[Observation]` — skips the metadata
    header blocks, parses `Datum` + `Tid (UTC)` → epoch-ms UTC, value →
    `float | None` (`113`/empty → `None`), keeps quality char.
  - `parse_recent_json(payload) -> list[Observation]` — maps the `value`
    array; string value → `float | None`.
  - Common `Observation` dataclass: `ts_utc: int`, `cloud_pct: float | None`,
    `quality: str`.
- **`CacheRepository`** (ABC, `app/repositories/base.py`)
  - `nearest_station(lat, lon, max_km) -> Station | None`
  - `upsert_stations(stations)` / `upsert_observations(station_id, obs)`
  - `get_observations(station_id, start_ts, end_ts) -> list[Observation]`
  - `get_fetch_log(station_id, kind) -> FetchLog | None`
  - `record_fetch(station_id, kind, covered_from, covered_to, fetched_at)`
  - Default impl **`SqliteRepository`** (`app/repositories/sqlite.py`).
    A future `ParquetRepository` / `DuckDbRepository` can implement the same
    interface without touching the client or API.
- **`CloudCoverService`** (`app/services/cloud_cover.py`) — orchestrates
  resolve → ensure-cached → read → aggregate. Holds a per-station
  `asyncio.Lock` registry to coalesce concurrent ingests.

## 5. Data Model (SQLite via SQLModel)

- **`Station`**: `id` (SMHI station id, PK) · `name` · `lat` · `lon` ·
  `active` · `from_ts` · `to_ts`.
- **`Observation`**: `station_id` (FK) · `ts_utc` (epoch-ms) ·
  `cloud_pct` (nullable) · `quality`. **Unique (`station_id`, `ts_utc`)** —
  upsert via SQLite `ON CONFLICT(station_id, ts_utc) DO UPDATE` for the
  archive/recent overlap.
- **`FetchLog`** (ledger): `station_id` · `kind` (`archive` | `recent`) ·
  `fetched_at` · `covered_from` · `covered_to`. One row per
  `(station_id, kind)`; drives the refresh decisions. Without it, a genuine
  data gap is indistinguishable from "never fetched".

## 6. Data Flow & Refresh Logic

**`ensure_cached(station_id)`**

1. **Station list** empty or stale (> 30 days) → `fetch_station_list()` +
   `upsert_stations`.
2. **Archive** — if no `FetchLog(kind="archive")`: `fetch_archive`, parse,
   filter to `ts >= now − 13 months`, `upsert_observations`, `record_fetch`.
   Otherwise skip (immutable).
3. **Recent window** — if no `FetchLog(kind="recent")` or its `fetched_at`
   is older than **TTL = 1 h**: `fetch_recent`, parse, upsert (overwrites
   overlapping timestamps), `record_fetch`.

**Read — `get_cloud_cover(lat, lon, resolution)`**

1. `nearest_station(lat, lon)` (cap at a max radius).
2. `ensure_cached(station.id)` under the per-station lock.
3. `get_observations(station.id, now − 365 days, now)`.
4. Aggregate:
   - `hourly`: raw rows.
   - `daily` / `monthly`: **mean of non-null `cloud_pct`** per UTC bucket,
     with a `count` (non-null samples in the bucket) so sparse buckets are
     visible.

**Endpoint**

```
GET /cloud-cover?lat={lat}&lon={lon}&resolution=hourly|daily|monthly
```

Response:

```json
{
  "station": { "id": 92410, "name": "Arvika A", "lat": 59.67, "lon": 12.64,
               "distance_km": 8.2 },
  "resolution": "daily",
  "unit": "percent",
  "stale": false,
  "attribution": "Data: SMHI (CC BY 4.0)",
  "points": [ { "ts": 1717113600000, "value": 62.5, "count": 22 } ]
}
```

The existing `/metrics` stub is left untouched.

## 7. Error Handling & Edge Cases

- **SMHI down / timeout:** if the cache already has data → serve it with
  `stale: true`; if nothing is cached → `503` with a clear message.
- **Partial ingest:** archive succeeds but recent fails → serve archive,
  do **not** record the recent ledger → retried on the next request. Each
  `kind` is ledgered independently.
- **Concurrent ingest of the same station:** idempotent upserts make it safe;
  a per-station `asyncio.Lock` coalesces duplicate fetches.
- **No station within max radius / outside Sweden:** `404` with a message.
- **Indeterminate values** (`113`, empty): stored as `None`; excluded from
  both the aggregation mean and `count` (which tracks usable, non-null
  samples). A fully-indeterminate bucket therefore yields `count: 0` and a
  `null` value, which the frontend can render as a gap.
- **Quality codes:** retained as-is this iteration (no filtering); a later
  spec can let callers exclude `R`/`Y`.

## 8. Testing Strategy

Integration-first; mock only the SMHI HTTP boundary.

- **Parser unit tests** against committed fixtures: a real-shaped archive CSV
  (metadata header blocks, a `113`, an empty value, `Y` and `G` codes) and a
  recent JSON sample.
- **Refresh-logic tests** (table-driven): empty cache → fetches both; archive
  present → skips archive; recent fresh → no fetch; recent stale → refetch;
  overlap → no duplicate rows.
- **Repository tests:** upsert dedupe on `(station_id, ts_utc)`;
  `get_observations` range; nearest-station math.
- **Endpoint integration tests** (httpx mocked via respx/monkeypatch):
  hourly/daily/monthly response shapes; stale-serve path; 404 / 503 paths.

## 9. Open Items / Future Work

- Scheduled background refresh that calls the same ingest function.
- Multi-station "region" aggregation (nearest-N or drawn area).
- Quality-code filtering options for callers.
- Optional Parquet/DuckDB repository for whole-network analytics.
- Lightning-strike probability (separate parameter + spec).

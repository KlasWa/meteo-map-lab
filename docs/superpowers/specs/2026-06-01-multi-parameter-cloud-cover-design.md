# Multi-Parameter Cloud Cover (param 16 + 29) — Design

Date: 2026-06-01
Status: Approved

## Goal

Serve SMHI parameter **29** (Molnmängd, lägsta molnlager — low-cloud amount,
octas 0–8) alongside the existing parameter **16** (Total molnmängd — total
cloud cover, percent 0–100). Both parameters are treated identically:
cached (recent + archive), aggregated at hourly/daily/monthly resolutions, and
served through the same endpoint. The frontend overlays both on one chart with
separate Y-axes.

Motivation: param 16 (manual observation) is being phased out and has only ~15
active stations nationwide; param 29 is automatic (ceilometer) with ~180 active
stations, giving far denser coverage. Offering both lets the user compare and
fall back to whichever has a nearby station.

## Decisions (locked during brainstorming)

1. **Units — keep native.** Param 29 stays in octas (0–8, unit `"octas"`);
   param 16 stays in percent (0–100, unit `"percent"`). No cross-conversion.
2. **Selector — raw param ids.** The endpoint takes `?param=16|29`.
3. **Frontend — overlay both** on a single chart with two Y-axes (left =
   percent for 16, right = octas for 29).
4. **Param is a first-class dimension** threaded through client → service →
   repo → schema (Approach A: one service instance, param passed per call,
   backed by a small parameter registry).

## Parameter Registry

New module `backend/app/services/parameters.py`:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class ParameterSpec:
    id: int
    label: str
    unit: str
    indeterminate: frozenset[float]

PARAMETERS: dict[int, ParameterSpec] = {
    16: ParameterSpec(16, "Total cloud cover", "percent", frozenset({113.0})),
    29: ParameterSpec(29, "Low cloud amount",  "octas",   frozenset({9.0})),
}
```

- Values are stored native (0–8 for param 29, 0–100 for param 16).
- `indeterminate` codes map to `None` during parsing: `113` for param 16
  ("cannot determine"), `9` for param 29 ("sky obscured"). Empty strings map to
  `None` for both, as today.
- `cloud_cover_params: list[int] = [16, 29]` is added to settings as the
  allowed/known set. `cloud_cover_param` (the old single default = 16) is kept
  as the endpoint default.

## Data Model

`param` becomes part of the identity in `backend/app/models.py`. The SQLite
file is a regenerable cache (no Alembic); the schema change is applied by
recreating the DB (`make rebuild`) — no migration code is written.

- **Station**: composite primary key `(param, id)`. `active` differs per
  parameter, so a station that reports both parameters has one row per param.
  `name`, `lat`, `lon` are duplicated across the param rows (acceptable for a
  cache).
- **Observation**: rename `cloud_pct` → `value` (`float | None`). Add `param`.
  Unique constraint `(param, station_id, ts_utc)`.
- **FetchLog**: add `param`. Unique constraint `(param, station_id, kind)`.
  The station-list ledger row uses `station_id = 0` per param.

`app/dto.py`: `ParsedObs.cloud_pct` → `ParsedObs.value`. `StationRaw` is
unchanged in shape but is now stored per-param (the caller supplies `param`).

## Client / Service / Repository

`param` is passed per call (not fixed at construction):

- **SMHIClient** (`app/services/smhi.py`): `fetch_station_list(param)`,
  `fetch_recent(param, station_id)`, `fetch_archive(param, station_id)`. The
  `param` constructor arg is removed.
- **CacheRepository** (ABC + SqliteRepository): every method gains a leading
  `param: int` argument and filters by it. `nearest_station(param, lat, lon,
  max_km)` filters `active == True AND param == param` (extends the
  active-station fix). `station_count(param)`.
- **CloudCoverService** (`app/services/cloud_cover.py`): `ensure_station_list(
  param, now_ms)`, `ensure_cached(param, station_id, now_ms)`,
  `get_cloud_cover(param, lat, lon, resolution, now_ms=None)`. Per-station locks
  are keyed by `(param, station_id)`. The recent-404-non-fatal and stale-serve
  behaviors are preserved per param. One service instance handles both params.
- **Parser** (`app/services/smhi_parse.py`): `parse_archive_csv` and
  `parse_recent_json` take the spec's `indeterminate` set instead of the
  hardcoded `113`. CSV parsing keys off the `Datum;` header line, so param 29's
  different value-column name is handled with no change. `aggregate` is already
  unit-agnostic (mean of values + non-null count) — unchanged.

## API

`GET /api/cloud-cover?lat={f}&lon={f}&param={16|29}&resolution={hourly|daily|monthly}`

- `param` validated via `Literal[16, 29]`, default `16`. Unknown values →
  FastAPI 422.
- Each request independently resolves its own nearest **active** station for
  that param, so the two series may originate from different stations and
  distances. This is intentional and exposed via the per-response `station`.
- Errors unchanged: `NoStationFound` → 404, `SMHIUnavailable` → 503.

`CloudCoverResponse` (`app/schemas/cloud_cover.py`) gains:
- `param: int`
- `unit: str` now reflects the spec (`"percent"` for 16, `"octas"` for 29)
  instead of the hardcoded `"percent"`.

The route builds one service via `lru_cache` (param-agnostic) and passes
`param` from the query into `service.get_cloud_cover(...)`.

## Frontend

- `frontend/src/lib/api.ts`: `getCloudCover(lat, lon, resolution, param)`;
  regenerate types from the updated OpenAPI schema (`make gen-api`).
- The view fetches param 16 and param 29 in parallel for the selected
  location/resolution and renders **one** dual-axis Chart.js line chart:
  - Left Y-axis: percent, 0–100 (param 16).
  - Right Y-axis: octas, 0–8 (param 29).
  - Shared time X-axis; `spanGaps: false`.
  - Legend labels each series with its station name + distance (since the two
    may differ).
- Resolution tabs drive both series. Loading / error / empty / stale states are
  handled per series: if one param has no nearby active station (404) the other
  still renders, with a note for the missing one.

## Testing

- **parameters**: registry lookups; indeterminate sets per param.
- **parser**: param 29 octas parsed native; code `9` → `None`; param 16 `113`
  → `None` still holds.
- **repository**: param-scoped CRUD; `nearest_station` isolates by param and
  active; same station id in both param sets does not collide.
- **service**: ensure/cache/aggregate per param; locks keyed by
  `(param, station_id)`; 404-recent fallback and stale-serve per param.
- **endpoint**: `param=16` vs `param=29` return correct `unit`/`param`; invalid
  `param` → 422; 404/503 paths intact.
- **frontend**: typecheck + lint; chart renders two datasets on two axes.

## Out of Scope

- No octa↔percent conversion or unified scale.
- No combined multi-param endpoint (`?params=16,29`); the frontend orchestrates
  two single-param requests.
- No new parameters beyond 16 and 29 (the registry makes adding more trivial
  later).
- No Alembic / migration tooling; the dev cache is recreated.

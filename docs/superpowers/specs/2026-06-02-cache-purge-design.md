# Cache Purge Endpoint + Button — Design

Date: 2026-06-02
Status: Approved

## Goal

Provide a way to clear the SQLite cache (cloud and/or lightning) on demand: a
`DELETE /api/cache` endpoint and a "Purge cache" button in the frontend. The
cache is regenerable — purging forces a fresh re-fetch from SMHI on the next
request.

## What the cache is

The cache is the SQLite tables:
- Cloud: `Station`, `Observation`, `FetchLog`.
- Lightning: `LightningStrike`, `LightningDay`.

The services (`CloudCoverService`, `LightningService`) are `lru_cache`
singletons holding only per-station/day `threading.Lock`s — **no in-memory data
cache**. So "purge" means deleting rows from the tables; the locks are harmless
and left untouched. Re-fetch repopulates on the next request.

## Decisions (locked during brainstorming)

1. **Scope is selectable:** `all` | `cloud` | `lightning` (default `all`).
2. **Ungated:** always available (no auth/flag). The data is regenerable; the
   only cost of an accidental purge is a slow re-fetch.
3. **`DELETE` verb:** purge is idempotent (purging twice = same result), so
   `DELETE` is the correct REST verb over `POST`.
4. **Purge logic lives on the repositories** (they own the tables), not in the
   route or a new service.
5. **Frontend:** one "Purge cache" button (purges `all`) with a confirmation
   step. After success, clear the displayed charts to the default state; do NOT
   auto-refetch (avoids an unexpected slow lightning cold-fetch).

## Backend

### Repository purge methods

- `CacheRepository.purge() -> dict[str, int]` (ABC + `SqliteRepository`):
  deletes all rows from `Observation`, `Station`, `FetchLog`. Returns row
  counts keyed by name, e.g. `{"observations": N, "stations": N, "fetch_logs": N}`.
- `LightningRepository.purge() -> dict[str, int]` (ABC +
  `SqliteLightningRepository`): deletes all rows from `LightningStrike`,
  `LightningDay`. Returns `{"lightning_strikes": N, "lightning_days": N}`.

Implementation: count then delete for deterministic counts (SQLite's
`DELETE`-without-`WHERE` `rowcount` can be unreliable). For each table:
`count = len(session.exec(select(Model.<pk>)).all())` (or `select(func.count())`),
then `session.exec(delete(Model))`; finally `session.commit()`. Use
`from sqlmodel import delete, select`.

### Endpoint

`DELETE /api/cache?scope={all|cloud|lightning}` (`scope: Literal["all",
"cloud", "lightning"] = "all"`).

- Reuses the existing `lru_cache` service getters to reach the repositories
  (`get_cloud_cover_service().repo`, `get_lightning_service().repo`) so there is
  no duplicate engine/repo wiring. The route takes them via `Depends(...)` on the
  two service getters (overridable in tests).
- `cloud` → cloud repo purge; `lightning` → lightning repo purge; `all` → both,
  with the count dicts merged.
- Returns `PurgeResponse`.

### Schema

`app/schemas/cache.py`:
```python
class PurgeResponse(BaseModel):
    scope: str
    deleted: dict[str, int]
```

Example: `{"scope": "all", "deleted": {"observations": 1234, "stations": 15,
"fetch_logs": 40, "lightning_strikes": 50000, "lightning_days": 360}}`.

### Settings

None required (ungated).

## Frontend

- `frontend/src/lib/api.ts`: `purgeCache(scope: "all" | "cloud" | "lightning" =
  "all"): Promise<Purge>` calling `client.DELETE("/api/cache", { params: {
  query: { scope } } })`; `Purge` type from the regenerated OpenAPI schema.
- A small **"Purge cache"** button (daisyUI `btn btn-ghost btn-xs` or
  `btn-outline`, matching the flat theme), placed near the chart controls /
  bottom of the sidebar so it sits next to the charts.
- On click: confirm first (a `window.confirm` is acceptable; copy: "Purge all
  cached SMHI data? The next view will re-fetch from SMHI (lightning is slow to
  refill)."). On confirm, call `purgeCache("all")`.
- On success: clear `results` and `lightning` state (charts return to the empty
  / default state) and show a brief inline status (e.g. a transient "Cache
  purged" line). Do not auto-refetch. On error: show a short error line.
- A simple in-flight guard (e.g. a `purging` boolean) disables the button while
  the request is in flight.

## Testing

- **Repository:** `SqliteRepository.purge()` deletes all cloud rows and returns
  correct counts; `SqliteLightningRepository.purge()` deletes all lightning rows
  and returns correct counts; purge on an empty cache returns zeros.
- **Endpoint:** `DELETE /api/cache` with `scope=cloud` clears only cloud tables;
  `scope=lightning` clears only lightning tables; `scope=all` (and default)
  clears both; response `deleted` counts match; invalid scope → 422.
- **Frontend:** typecheck + lint + build; the button calls `purgeCache` and
  clears the view on success.

## Out of Scope

- No auth/guard, no confirm-token (ungated by decision).
- No per-station / per-coordinate selective purge (only all/cloud/lightning).
- No auto-refetch after purge.
- No `DROP TABLE` / schema reset (rows only; that is what `make reset-db` is
  for).

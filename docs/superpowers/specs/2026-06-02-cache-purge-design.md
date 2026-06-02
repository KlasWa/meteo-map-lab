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
5. **Frontend:** a small purge button **next to each chart**, scoped to that
   chart's data — the cloud chart's button purges `cloud`, the lightning chart's
   purges `lightning`. Effectively a "purge & refresh": each confirms first, and
   on success **re-fetches that chart's data** for the current selection (so the
   chart repopulates with fresh data from SMHI). Lightning's refetch is slow on a
   cold cache — the confirmation copy warns about this. (The `scope=all` API
   value exists but is not used by the UI.)

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
- A small purge button **next to each chart**, scoped to that chart, in a small
  header row beside the chart title:
  - daisyUI `btn btn-ghost btn-xs btn-circle` matching the flat theme.
  - Icon: a **circular / round-arrows (refresh)** inline SVG — fitting since the
    action is purge-and-refresh. `aria-label` per scope ("Purge & refresh cloud
    data" / "Purge & refresh lightning data").
  - Cloud chart → purges `cloud`; lightning chart → purges `lightning`.
- On click: open a **daisyUI confirmation modal** (a `<dialog class="modal">`
  with `modal-box` + `modal-action`, opened via the dialog ref's `showModal()`).
  A single shared modal is driven by a `pendingScope: "cloud" | "lightning" |
  null` state; the modal title/body are scope-specific (e.g. "Purge cached cloud
  data and re-fetch from SMHI?" / "Purge cached lightning data and re-fetch from
  SMHI? Lightning is slow to refill."). Actions: a "Cancel" button (closes the
  modal) and a primary "Purge & refresh" button.
- On confirm: close the modal, call `purgeCache(pendingScope)`, then **re-fetch
  that chart's data** for the current selection + resolution (repopulating with
  fresh data) via the existing fetch paths (`getCloudCover` for the two params /
  `getLightning`). Show the chart's loading state while refetching. On error
  (purge or refetch): show a short error line for that chart.
- A per-chart in-flight guard disables that chart's purge button while its
  request is running.
- If no location is selected, the purge buttons are not shown (there are no
  charts to act on).

## Testing

- **Repository:** `SqliteRepository.purge()` deletes all cloud rows and returns
  correct counts; `SqliteLightningRepository.purge()` deletes all lightning rows
  and returns correct counts; purge on an empty cache returns zeros.
- **Endpoint:** `DELETE /api/cache` with `scope=cloud` clears only cloud tables;
  `scope=lightning` clears only lightning tables; `scope=all` (and default)
  clears both; response `deleted` counts match; invalid scope → 422.
- **Frontend:** typecheck + lint + build; each chart's purge button calls
  `purgeCache` with the right scope and re-fetches that chart on success.

## Out of Scope

- No auth/guard, no confirm-token (ungated by decision).
- No per-station / per-coordinate selective purge (only all/cloud/lightning).
- No `DROP TABLE` / schema reset (rows only; that is what `make reset-db` is
  for).

# Cache Purge Endpoint + Per-Chart Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `DELETE /api/cache?scope=all|cloud|lightning` endpoint that clears the SQLite cache, and a small circular-arrows "purge & refresh" button next to each chart (cloud → `cloud`, lightning → `lightning`) that confirms via a daisyUI modal then purges + re-fetches that chart.

**Architecture:** Purge logic lives on the repositories (`purge() -> dict[str,int]`, count-then-delete for accurate counts). The endpoint reuses the existing `lru_cache` service singletons to reach their `.repo`. The frontend adds per-chart scoped buttons + one shared confirm modal; on confirm it calls `purgeCache(scope)` then re-fetches that chart via extracted loader helpers.

**Tech Stack:** FastAPI, SQLModel/SQLite (backend); React 19, TypeScript, daisyUI, Chart.js (frontend).

**Reference:** spec at `docs/superpowers/specs/2026-06-02-cache-purge-design.md`.

**Note:** purge deletes rows only (no schema change), so no `make reset-db` is needed. Tests use in-memory SQLite.

---

### Task 1: Repository `purge()` methods

**Files:**
- Modify: `backend/app/repositories/base.py`, `backend/app/repositories/sqlite.py`, `backend/app/repositories/lightning_base.py`, `backend/app/repositories/lightning_sqlite.py`
- Test: `backend/tests/test_repository.py`, `backend/tests/test_lightning_repository.py`

- [ ] **Step 1: Write the failing tests.**

In `backend/tests/test_repository.py`, append (the file already imports `StrikeRaw`? no — it imports `ParsedObs, StationRaw` from `app.dto`; reuse those):

```python
def test_purge_clears_cloud(repo):
    repo.upsert_stations([StationRaw(id=1, name="S", lat=59.0, lon=18.0, active=True)])
    repo.upsert_observations(1, [ParsedObs(1000, 50.0, "G")])
    repo.record_fetch(0, "station_list", 1, None, None)
    counts = repo.purge()
    assert counts == {"observations": 1, "stations": 1, "fetch_logs": 1}
    assert repo.station_count() == 0
    assert repo.get_observations(1, 0, 2000) == []


def test_purge_empty_returns_zeros(repo):
    assert repo.purge() == {"observations": 0, "stations": 0, "fetch_logs": 0}
```

In `backend/tests/test_lightning_repository.py`, append:

```python
def test_purge_clears_lightning(lrepo):
    lrepo.upsert_strikes([_s(1000, 59.0, 18.0)])
    lrepo.record_day(86400000, fetched_at=1, count=1)
    counts = lrepo.purge()
    assert counts == {"lightning_strikes": 1, "lightning_days": 1}
    assert lrepo.has_any_day() is False
    assert lrepo.strikes_in_bbox(0.0, 90.0, 0.0, 90.0, 0, 2000) == []


def test_purge_empty_lightning_returns_zeros(lrepo):
    assert lrepo.purge() == {"lightning_strikes": 0, "lightning_days": 0}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && uv run pytest tests/test_repository.py::test_purge_clears_cloud tests/test_lightning_repository.py::test_purge_clears_lightning -v`
Expected: FAIL — `AttributeError: 'SqliteRepository' object has no attribute 'purge'` (and same for the lightning repo).

- [ ] **Step 3: Add `purge` to the cloud ABC** — in `backend/app/repositories/base.py`, add at the end of the `CacheRepository` class:

```python
    @abstractmethod
    def purge(self) -> dict[str, int]: ...
```

- [ ] **Step 4: Implement cloud `purge`** — in `backend/app/repositories/sqlite.py`, change the import line `from sqlmodel import Session, select` to:

```python
from sqlmodel import Session, delete, select
```

and add this method to `SqliteRepository` (e.g. after `record_fetch`):

```python
    def purge(self) -> dict[str, int]:
        # Count then delete: SQLite DELETE-without-WHERE rowcount is unreliable.
        with Session(self._engine) as s:
            counts = {
                "observations": len(s.exec(select(Observation.id)).all()),
                "stations": len(s.exec(select(Station.id)).all()),
                "fetch_logs": len(s.exec(select(FetchLog.id)).all()),
            }
            s.execute(delete(Observation))
            s.execute(delete(Station))
            s.execute(delete(FetchLog))
            s.commit()
        return counts
```

- [ ] **Step 5: Add `purge` to the lightning ABC** — in `backend/app/repositories/lightning_base.py`, add at the end of the `LightningRepository` class:

```python
    @abstractmethod
    def purge(self) -> dict[str, int]: ...
```

- [ ] **Step 6: Implement lightning `purge`** — in `backend/app/repositories/lightning_sqlite.py`, change the import line `from sqlmodel import Session, select` to:

```python
from sqlmodel import Session, delete, select
```

and add this method to `SqliteLightningRepository`:

```python
    def purge(self) -> dict[str, int]:
        # Count then delete: SQLite DELETE-without-WHERE rowcount is unreliable.
        with Session(self._engine) as s:
            counts = {
                "lightning_strikes": len(s.exec(select(LightningStrike.id)).all()),
                "lightning_days": len(s.exec(select(LightningDay.day_start_ms)).all()),
            }
            s.execute(delete(LightningStrike))
            s.execute(delete(LightningDay))
            s.commit()
        return counts
```

- [ ] **Step 7: Run the tests + full suite + lint**

Run: `cd backend && uv run pytest tests/test_repository.py tests/test_lightning_repository.py -q && uv run pytest -q && uv run ruff check app tests`
Expected: all PASS, ruff clean.

- [ ] **Step 8: Commit**

```bash
git add backend/app/repositories/base.py backend/app/repositories/sqlite.py backend/app/repositories/lightning_base.py backend/app/repositories/lightning_sqlite.py backend/tests/test_repository.py backend/tests/test_lightning_repository.py
git commit -m "feat(backend): repository purge() for cloud + lightning caches

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `DELETE /api/cache` endpoint

**Files:**
- Create: `backend/app/schemas/cache.py`
- Modify: `backend/app/api/routes.py`
- Test: `backend/tests/test_cache_endpoint.py`

- [ ] **Step 1: Write the failing test** — create `backend/tests/test_cache_endpoint.py`:

```python
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

import app.models  # noqa: F401
from app.api.routes import get_cloud_cover_service, get_lightning_service
from app.dto import ParsedObs, StationRaw, StrikeRaw
from app.main import app
from app.repositories.lightning_sqlite import SqliteLightningRepository
from app.repositories.sqlite import SqliteRepository


class _Svc:
    """Minimal stand-in exposing `.repo` (the endpoint only needs repo.purge())."""

    def __init__(self, repo):
        self.repo = repo


def _seeded_repos():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    crepo = SqliteRepository(engine)
    lrepo = SqliteLightningRepository(engine)
    crepo.upsert_stations([StationRaw(id=1, name="S", lat=59.0, lon=18.0, active=True)])
    crepo.upsert_observations(1, [ParsedObs(1000, 50.0, "G")])
    crepo.record_fetch(0, "station_list", 1, None, None)
    lrepo.upsert_strikes([StrikeRaw(ts_utc=1000, lat=59.0, lon=18.0, peak_current=-5.0, cloud_indicator=0)])
    lrepo.record_day(86400000, fetched_at=1, count=1)
    return crepo, lrepo


def _client_with(crepo, lrepo) -> TestClient:
    app.dependency_overrides[get_cloud_cover_service] = lambda: _Svc(crepo)
    app.dependency_overrides[get_lightning_service] = lambda: _Svc(lrepo)
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_purge_cloud_only():
    crepo, lrepo = _seeded_repos()
    r = _client_with(crepo, lrepo).delete("/api/cache", params={"scope": "cloud"})
    assert r.status_code == 200
    body = r.json()
    assert body["scope"] == "cloud"
    assert body["deleted"] == {"observations": 1, "stations": 1, "fetch_logs": 1}
    assert crepo.station_count() == 0
    assert lrepo.has_any_day() is True  # lightning untouched


def test_purge_lightning_only():
    crepo, lrepo = _seeded_repos()
    r = _client_with(crepo, lrepo).delete("/api/cache", params={"scope": "lightning"})
    assert r.status_code == 200
    assert r.json()["deleted"] == {"lightning_strikes": 1, "lightning_days": 1}
    assert lrepo.has_any_day() is False
    assert crepo.station_count() == 1  # cloud untouched


def test_purge_all_is_default():
    crepo, lrepo = _seeded_repos()
    r = _client_with(crepo, lrepo).delete("/api/cache")
    assert r.status_code == 200
    body = r.json()
    assert body["scope"] == "all"
    assert body["deleted"]["observations"] == 1
    assert body["deleted"]["lightning_strikes"] == 1
    assert crepo.station_count() == 0
    assert lrepo.has_any_day() is False


def test_purge_invalid_scope_422():
    crepo, lrepo = _seeded_repos()
    r = _client_with(crepo, lrepo).delete("/api/cache", params={"scope": "bogus"})
    assert r.status_code == 422
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_cache_endpoint.py -v`
Expected: FAIL — 404 (route not defined) / ImportError.

- [ ] **Step 3: Create the schema** — `backend/app/schemas/cache.py`:

```python
from pydantic import BaseModel


class PurgeResponse(BaseModel):
    scope: str
    deleted: dict[str, int]
```

- [ ] **Step 4: Add the route** — in `backend/app/api/routes.py`, add the import alongside the other schema imports:

```python
from app.schemas.cache import PurgeResponse
```

and append the route at the END of the file:

```python
@router.delete("/api/cache", response_model=PurgeResponse, tags=["cache"])
def purge_cache(
    scope: Literal["all", "cloud", "lightning"] = "all",
    cloud: CloudCoverService = Depends(get_cloud_cover_service),
    lightning_svc: LightningService = Depends(get_lightning_service),
) -> PurgeResponse:
    deleted: dict[str, int] = {}
    if scope in ("all", "cloud"):
        deleted.update(cloud.repo.purge())
    if scope in ("all", "lightning"):
        deleted.update(lightning_svc.repo.purge())
    return PurgeResponse(scope=scope, deleted=deleted)
```

- [ ] **Step 5: Run the full suite + lint**

Run: `cd backend && uv run pytest -q && uv run ruff check app tests`
Expected: all PASS, ruff clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/cache.py backend/app/api/routes.py backend/tests/test_cache_endpoint.py
git commit -m "feat(backend): DELETE /api/cache purge endpoint (scope all|cloud|lightning)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Frontend API client (`purgeCache`)

**Files:**
- Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/api-schema.d.ts` (generated), `backend/openapi.json` (generated)

- [ ] **Step 1: Regenerate the OpenAPI schema + types** (runs locally):

```bash
cd /Users/klaswallden/elvy-map/backend && uv run python scripts/export_openapi.py
cd /Users/klaswallden/elvy-map/frontend && npm run gen:types
```
Confirm `backend/openapi.json` and `frontend/src/lib/api-schema.d.ts` now contain `/api/cache` with a `delete` operation (grep for `cache`).

- [ ] **Step 2: Add the helper** — append to `frontend/src/lib/api.ts`:

```typescript
export type Purge =
  paths["/api/cache"]["delete"]["responses"]["200"]["content"]["application/json"];

export async function purgeCache(
  scope: "all" | "cloud" | "lightning" = "all",
): Promise<Purge> {
  const { data, error } = await client.DELETE("/api/cache", {
    params: { query: { scope } },
  });
  if (data) return data;
  throw new Error(error ? JSON.stringify(error) : "purge failed");
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit** (adjust generated paths to what `git status` shows):

```bash
cd /Users/klaswallden/elvy-map
git add frontend/src/lib/api.ts frontend/src/lib/api-schema.d.ts backend/openapi.json
git commit -m "feat(frontend): purgeCache API client + regen types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Per-chart purge buttons + confirm modal + refetch

**Files:**
- Modify: `frontend/src/App.tsx`

> READ `frontend/src/App.tsx` fully first — it is actively edited; integrate into its current structure, preserving every existing feature (URL-state, ✕ clear button, api-status indicator, resolution tabs + period select, both charts, map toggle, period filter). A Prettier-on-save hook formats on edit; verify with `npm run format:check`.

- [ ] **Step 1: Imports.** Add `useRef` to the React import; add `purgeCache` to the `./lib/api` value import. Final React import line:
```typescript
import { useCallback, useEffect, useRef, useState } from "react";
```
and the api import becomes:
```typescript
import { getCloudCover, getHealth, getLightning, purgeCache } from "./lib/api";
```

- [ ] **Step 2: Extract loader helpers** so both the effect and the purge handler share one fetch path. Just above the existing data-fetch `useEffect`, add:

```typescript
  const loadCloud = useCallback(
    async (sel: LatLon, res: Resolution) => {
      const entries = await Promise.all(
        PARAMS.map(async (p): Promise<[number, ParamResult]> => {
          try {
            const data = await getCloudCover(sel.lat, sel.lon, res, p.id);
            return [p.id, { data, error: null }];
          } catch (e: unknown) {
            return [
              p.id,
              { data: null, error: e instanceof Error ? e.message : "failed" },
            ];
          }
        }),
      );
      return Object.fromEntries(entries) as Record<number, ParamResult>;
    },
    [],
  );

  const loadLightning = useCallback(
    async (
      sel: LatLon,
      res: Resolution,
    ): Promise<{ data: Lightning | null; error: string | null }> => {
      try {
        const data = await getLightning(sel.lat, sel.lon, res);
        return { data, error: null };
      } catch (e: unknown) {
        return { data: null, error: e instanceof Error ? e.message : "failed" };
      }
    },
    [],
  );
```

- [ ] **Step 3: Refactor the effect to use the loaders.** Replace the body of the data-fetch `useEffect` (the `Promise.all([...])...` expression, keeping `if (!selection) return; let cancelled = false;` and the `return () => { cancelled = true; };`) with:

```typescript
    Promise.all([
      loadCloud(selection, resolution),
      loadLightning(selection, resolution),
    ])
      .then(([cloudResults, lightningResult]) => {
        if (cancelled) return;
        setResults(cloudResults);
        setLightning(lightningResult);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
```
and add `loadCloud, loadLightning` to that effect's dependency array (so it becomes `[selection, resolution, loadCloud, loadLightning]`).

- [ ] **Step 4: Add purge state + modal ref + handlers.** After `handleMapClick`, add:

```typescript
  const [pendingScope, setPendingScope] = useState<"cloud" | "lightning" | null>(
    null,
  );
  const [purging, setPurging] = useState<"cloud" | "lightning" | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const purgeModalRef = useRef<HTMLDialogElement>(null);

  const openPurge = useCallback((scope: "cloud" | "lightning") => {
    setPendingScope(scope);
    purgeModalRef.current?.showModal();
  }, []);

  // Purge that chart's cache then re-fetch it (the "purge & refresh" action).
  const purgeAndRefetch = useCallback(
    async (scope: "cloud" | "lightning") => {
      if (!selection) return;
      setPurging(scope);
      setPurgeError(null);
      try {
        await purgeCache(scope);
        if (scope === "cloud") {
          setResults(await loadCloud(selection, resolution));
        } else {
          setLightning(await loadLightning(selection, resolution));
        }
      } catch (e: unknown) {
        setPurgeError(e instanceof Error ? e.message : "purge failed");
      } finally {
        setPurging(null);
      }
    },
    [selection, resolution, loadCloud, loadLightning],
  );
```

- [ ] **Step 5: Add per-chart busy flags + a reusable purge button.** Just before the `return (`, add:

```typescript
  const cloudBusy = loading || purging === "cloud";
  const lightningBusy = loading || purging === "lightning";

  const purgeButton = (scope: "cloud" | "lightning", label: string) => (
    <button
      type="button"
      onClick={() => openPurge(scope)}
      disabled={purging !== null}
      className="btn btn-ghost btn-xs btn-circle"
      aria-label={label}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
```

- [ ] **Step 6: Add a header row with the purge button above the cloud chart.** Immediately before the cloud chart container (`<div className="relative mx-auto aspect-[2/1] ...">`), insert:

```tsx
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold opacity-70">Cloud cover</h3>
              {purgeButton("cloud", "Purge & refresh cloud data")}
            </div>
```
Then in the cloud chart container, change the three `loading`/`!loading` conditions to use `cloudBusy`/`!cloudBusy`:
```tsx
              {cloudBusy && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="loading loading-spinner loading-lg" />
                </div>
              )}
              {!cloudBusy && series.length > 0 && (
                <CloudCoverChart series={series} resolution={resolution} />
              )}
              {!cloudBusy && series.length === 0 && (
                <p className="text-sm opacity-70">
                  No cloud-cover data for this location and range.
                </p>
              )}
```

- [ ] **Step 7: Add the purge button to the lightning header + use `lightningBusy`.** Replace the lightning header `<h3>` line with a header row:
```tsx
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xs font-semibold opacity-70">
                  Lightning — strikes within {lightning.data?.radius_km ?? 50} km
                </h3>
                {purgeButton("lightning", "Purge & refresh lightning data")}
              </div>
```
and in the lightning chart container change the three `loading`/`!loading` conditions to `lightningBusy`/`!lightningBusy`:
```tsx
                {!lightningBusy &&
                  lightning.data &&
                  lightningInWindow.length > 0 && (
                    <LightningChart
                      data={{ ...lightning.data, points: lightningInWindow }}
                      resolution={resolution}
                      color="oklch(57% 0.21 27)"
                    />
                  )}
                {!lightningBusy &&
                  lightning.data &&
                  lightningInWindow.length === 0 && (
                    <p className="text-sm opacity-70">
                      No lightning recorded in this period.
                    </p>
                  )}
                {!lightningBusy && !lightning.data && lightning.error && (
                  <p className="text-sm opacity-50">{lightning.error}</p>
                )}
                {lightningBusy && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="loading loading-spinner loading-lg" />
                  </div>
                )}
```

- [ ] **Step 8: Show a purge error line + render the modal.** After the `{attribution && ...}` line (still inside the selected-location `<>...</>` block), add the error line:
```tsx
            {purgeError && (
              <p className="text-xs text-error">{purgeError}</p>
            )}
```
Then, just before the closing `</aside>` (after the api-status indicator div), add the shared modal:
```tsx
        <dialog ref={purgeModalRef} className="modal">
          <div className="modal-box">
            <h3 className="text-base font-bold">
              Purge cached {pendingScope} data?
            </h3>
            <p className="py-2 text-sm opacity-70">
              This deletes the cached {pendingScope} data and re-fetches it from
              SMHI
              {pendingScope === "lightning"
                ? " (lightning is slow to refill)"
                : ""}
              .
            </p>
            <div className="modal-action">
              <form method="dialog">
                <button className="btn btn-ghost btn-sm">Cancel</button>
              </form>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  purgeModalRef.current?.close();
                  if (pendingScope) void purgeAndRefetch(pendingScope);
                }}
              >
                Purge &amp; refresh
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button aria-label="Close">close</button>
          </form>
        </dialog>
```

- [ ] **Step 9: Verify**

Run: `cd /Users/klaswallden/elvy-map/frontend && npm run typecheck && npm run lint && npm run build && npm run format:check`
Expected: all PASS (pre-existing >500 kB chunk warning is fine).

- [ ] **Step 10: Commit**

```bash
cd /Users/klaswallden/elvy-map
git add frontend/src/App.tsx
git commit -m "feat(frontend): per-chart purge & refresh buttons with confirm modal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Update planning docs

**Files:**
- Modify: `ai-docs/PLANNING.md`

- [ ] **Step 1: Note the feature.** READ `ai-docs/PLANNING.md`; add a one-line note in the Data Flow (or an "Operations"/tooling area, matching the file's style) that `DELETE /api/cache?scope=all|cloud|lightning` clears the cache and the frontend exposes a per-chart "purge & refresh" button. Update the `_Last updated_` line to `2026-06-02` with a short note. Keep it concise and in the file's voice.

- [ ] **Step 2: Commit**

```bash
git add ai-docs/PLANNING.md
git commit -m "docs: note cache-purge endpoint + buttons in planning"
```

---

## Final verification

- [ ] **Backend:** `cd backend && uv run pytest -q && uv run ruff check app tests` — all green.
- [ ] **Frontend:** `cd frontend && npm run typecheck && npm run lint && npm run build` — all green.
- [ ] **Manual smoke (optional):** `make up`; select a location; click the circular-arrows button by a chart → confirm in the modal → that chart shows a spinner, the cache row is purged, and the chart repopulates (cloud is quick; lightning is slow on a cold cache).

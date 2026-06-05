# PLANNING.md — meteo-map-lab

> Project planning and architecture reference for AI-agent collaboration.
> Source brief: [`README-instructions.md`](../README-instructions.md)

## Purpose & Goals

meteo-map-lab is a web application that uses SMHI (Swedish Meteorological and
Hydrological Institute) data to analyze and visualize **cloud coverage** and
**lightning-strike probability** for a chosen geographic location.

Core goals:

- Let a user enter an address and select a location (with a configurable
  "difficulty"/precision level).
- For that location, compute cloud cover and lightning-strike likelihood.
- Visualize the results as charts broken down **per day, per month, and per
  year**, including a monthly view across a full year.
- Build on **historical SMHI data** rather than only live observations.

Bonus / stretch goals (from the brief):

- CI/CD pipeline via GitHub Actions (or equivalent).
- AI-based forecasting/prognosis function.

## Architecture Overview

```
┌──────────────┐      HTTPS/JSON      ┌──────────────┐      HTTP      ┌──────────────┐
│  React SPA   │  ───────────────▶    │ Python API   │  ──────────▶   │  SMHI Open   │
│  (frontend)  │  ◀───────────────    │  (backend)   │  ◀──────────   │  Data APIs   │
└──────────────┘   charts, address    └──────────────┘   weather/     └──────────────┘
                   input, location          │  cache         lightning data
                   selection                ▼
                                      ┌──────────────┐
                                      │  Data store  │
                                      │ (historical/ │
                                      │   cached)    │
                                      └──────────────┘
```

The frontend handles address input, location selection, and visualization.
The backend fetches and caches SMHI data, runs the cloud/lightning
calculations, and exposes a clean JSON API. A data store holds downloaded
historical data so repeated queries don't re-hit SMHI.

## Tech Stack

| Layer        | Choice                                     | Notes                                          |
| ------------ | ------------------------------------------ | ---------------------------------------------- |
| Frontend     | React 19 + TypeScript 6, Vite 8            | Charts via Chart.js + react-chartjs-2.         |
| Styling      | Tailwind CSS 4 + daisyUI 5                 | Via `@tailwindcss/vite` plugin.                |
| Map          | MapTiler SDK 4 (MapLibre GL), hybrid-v4    | Interactive map for location selection.        |
| Geocoding    | MapTiler Geocoding Control                 | `@maptiler/geocoding-control`; needs API key.  |
| Backend      | FastAPI (Python 3.12), Uvicorn             | httpx for SMHI calls, pydantic-settings.       |
| API client   | openapi-typescript + openapi-fetch         | Typed client generated from backend OpenAPI.   |
| Data source  | SMHI Open Data APIs                         | Meteorological observations + historical data. |
| Data store   | SQLite via SQLModel (SQLAlchemy)           | `sqlite:///./meteo_map_lab.db`; Postgres later.     |
| Package mgmt | uv (backend), npm (frontend)               | `uv.lock` / `package-lock.json` committed.     |
| Dev env      | Docker Compose + devcontainer, Makefile    | frontend + backend services, helper targets.   |
| Tooling      | Ruff + pylint + pytest (backend), ESLint + tsc (FE) | Lint/format and tests.                 |
| Deployment   | GCP Cloud Run (europe-north1) + Terraform  | Two services; SQLite replicated to GCS via Litestream. |
| CI/CD        | GitHub Actions, WIF-authenticated          | `test.yml` on PRs (pytest, tsc/lint, TF plan); `deploy.yml` on push to main. |
| Observability | Cloud Logging (structured JSON) + Cloud Trace correlation | Per-request `duration_ms`, per-outbound SMHI call, all linked via `X-Cloud-Trace-Context`. |
| Forecasting  | AI/ML model (bonus)                        | Predict cloud/lightning trends.                |

All earlier TBDs are now decided (charting → Chart.js, data store → SQLite,
geocoding → MapTiler). Capture future open decisions as specs in
[`../specs/`](../specs/) before implementing.

## Components

### Frontend (React)

- Address search box with geocoding to coordinates.
- Location/precision ("difficulty level") selector.
- Chart views: cloud coverage and lightning probability, switchable across
  day / month / year granularity, plus a monthly-over-one-year view.

### Backend (Python)

- REST/JSON API consumed by the frontend.
- SMHI client: download and parse historical weather data.
- Calculation layer: derive cloud coverage and lightning-strike probability
  for a coordinate.
- Caching/persistence so historical pulls are reused.

### SMHI Data Integration

- Identify the relevant SMHI Open Data endpoints (observations, parameters for
  cloud cover and lightning).
- Map a geocoded coordinate to the nearest relevant SMHI station(s).
- Handle bulk download of historical series and incremental refresh.

## Data Flow

1. User enters an address (MapTiler geocoding) or clicks the map.
2. The selection resolves to latitude/longitude.
3. Frontend calls `GET /api/cloud-cover?lat=&lon=&resolution=&param=` once per
   parameter (16 = total cloud %, 29 = low-cloud octas) at the chosen
   granularity (hourly/daily/monthly).
4. Backend resolves the coordinate to the nearest active SMHI station for that
   parameter, serving cached data or fetching from SMHI when missing/stale
   (archive fetched once, recent window refreshed on a TTL).
5. Backend aggregates hourly observations into the requested resolution and
   returns the series in the parameter's native unit (with `param`, `unit`, a
   `stale` flag, and SMHI attribution).
6. Frontend overlays both parameters on a Chart.js line chart with separate
   Y-axes (percent left, octas right).
7. Frontend calls `GET /api/lightning?lat=&lon=&resolution=` to fetch strike
   counts within a fixed radius of the coordinate, charted as bars alongside
   the cloud-cover lines.

### Cache Purging

The backend exposes `DELETE /api/cache?scope=all|cloud|lightning` to purge cached
SMHI data (rows only, not the schema). Each chart has a small "purge & refresh"
button (circular-arrows icon) that opens a daisyUI confirm modal, purges that
chart's cached data, and re-fetches it immediately.

## Deployment (Terraform)

Infrastructure lives under [`infra/`](../infra/):

- `infra/bootstrap/` — one-time, run locally: GCS bucket for the `infra/main/`
  Terraform state, Workload Identity Federation pool + provider for GitHub
  Actions, and the CI service account.
- `infra/main/` — applied from CI: APIs, Artifact Registry, the Litestream
  GCS replica bucket, Secret Manager (`maptiler-key`), runtime service
  accounts, and the two Cloud Run services. Cloud Run image is owned by
  `gcloud run deploy` (TF `ignore_changes` on the container image) so PR
  plans stay noise-free.

Production runtime in `europe-north1`:

- Backend Cloud Run service (`min=1, max=1`, 1 vCPU / 1 GiB,
  `cpu_idle = true`) — always-on so SQLite has a single writer and
  Litestream replicates the WAL to GCS continuously. Restored on every
  cold start from the latest GCS snapshot.
- Frontend Cloud Run service (`min=0, max=4`) — nginx serving the Vite
  bundle, with `VITE_API_URL` + `VITE_MAPTILER_KEY` baked at CI build time.
- Both public, both authenticated to the project's own SAs only via
  scoped bindings (no project-wide secrets/storage access).

See [`docs/superpowers/specs/2026-06-01-gcp-cloud-run-litestream-deploy-design.md`](../docs/superpowers/specs/2026-06-01-gcp-cloud-run-litestream-deploy-design.md)
for the full design and [`docs/superpowers/plans/2026-06-01-gcp-deploy.md`](../docs/superpowers/plans/2026-06-01-gcp-deploy.md)
for the step-by-step plan that built it.

## Milestones / Roadmap

1. **Scaffold** — frontend (React+TS) + backend (FastAPI) projects, dev
   container, OpenAPI-typed client. ✅ Done (see
   `docs/superpowers/plans/2026-05-28-scaffold.md`).
2. **SMHI integration (cloud cover)** — fetch + parse historical cloud-cover
   data (param 16) for a coordinate, cached in SQLite behind a swappable
   repository. ✅ Done (see
   `docs/superpowers/specs/2026-05-31-smhi-cloud-cover-caching-design.md`).
3. **Cloud-cover API + aggregation** — `GET /api/cloud-cover` serving
   hourly/daily/monthly means over ~the past year, with lazy/TTL caching and
   stale-serve fallback. ✅ Done.
4. **Cloud-cover visualization** — Chart.js line chart in the frontend with a
   hourly/daily/monthly toggle, driven by map location selection. ✅ Done.
5. **Multi-parameter cloud cover** — serve SMHI param 29 (low-cloud amount,
   octas) alongside param 16 (total cloud, percent), cached/aggregated
   identically and overlaid on a dual-axis chart; `param` is a first-class
   dimension across client/service/cache/API. ✅ Done (see
   `docs/superpowers/plans/2026-06-01-multi-parameter-cloud-cover.md`).
6. **Lightning-strike probability** — lightning strike counts within a fixed
   radius (default 50 km) are fetched from the SMHI lightning archive, cached
   per-day in SQLite, aggregated hourly/daily/monthly, and charted as bars
   below the cloud chart. ✅ Done (see
   `docs/superpowers/plans/2026-06-01-smhi-lightning.md`).
7. **Deployment** — GCP Cloud Run (europe-north1) for both services,
   SQLite preserved at runtime via Litestream → GCS, Terraform-provisioned,
   deployed by GitHub Actions on push to `main`. ✅ Done (see
   `docs/superpowers/specs/2026-06-01-gcp-cloud-run-litestream-deploy-design.md`).
8. **Observability & performance** — SQL-side aggregation (no Python ORM
   hydration on cached reads, ~10× faster on Cloud Run's 1 vCPU);
   structured JSON logs surfacing per-request `duration_ms` and per
   outbound SMHI call (`outbound_request`); Cloud Trace correlation so
   every entry from one request groups under a single trace in Cloud
   Logging. ✅ Done.
9. **Bonus** — AI forecasting. ⏳ Not started.

> Deferred within the cloud-cover work (see spec §9): scheduled background
> refresh, multi-station "region" aggregation, quality-code filtering, and an
> optional Parquet/DuckDB repository.

## Scaling Considerations

- Cache and pre-aggregate historical SMHI data to avoid repeated heavy pulls.
- Consider a background job for refreshing/ingesting data on a schedule.
- Choose a data store that handles time-series aggregation efficiently as
  history grows.

---

## How AI agents should use this repo

- **`ai-docs/`** — durable project knowledge (this file, design notes, decisions).
- **`specs/`** — one file per feature/decision before it is built. Use the
  spec workflow (`/spec-generate` → `/spec-implement` → `/spec-finish`).

_Last updated: 2026-06-05 (deployment now live on GCP; SQL aggregation, structured logs, and Cloud Trace correlation added)._

# PLANNING.md — elvy-map

> Project planning and architecture reference for AI-agent collaboration.
> Source brief: [`README-instructions.md`](../README-instructions.md)

## Purpose & Goals

elvy-map is a web application that uses SMHI (Swedish Meteorological and
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

| Layer        | Choice (proposed)                          | Notes                                          |
| ------------ | ------------------------------------------ | ---------------------------------------------- |
| Frontend     | React                                      | Per brief. Charting lib TBD (Recharts/Chart.js).|
| Geocoding    | Address → lat/long service                 | E.g. Nominatim / a geocoding API.              |
| Backend      | Python                                     | FastAPI or Flask (decision pending).           |
| Data source  | SMHI Open Data APIs                        | Meteorological observations + historical data. |
| Data store   | TBD                                        | SQLite/Postgres or cached files for history.   |
| Deployment   | Terraform                                  | Per brief.                                      |
| CI/CD        | GitHub Actions (bonus)                     | Lint, test, build, deploy.                      |
| Forecasting  | AI/ML model (bonus)                        | Predict cloud/lightning trends.                |

> Items marked TBD are open decisions — capture them as specs in
> [`../specs/`](../specs/) before implementing.

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

1. User enters an address in the React app.
2. Address is geocoded to latitude/longitude.
3. Frontend requests metrics for the coordinate + granularity from the backend.
4. Backend resolves the coordinate to SMHI station(s), serving cached
   historical data or fetching from SMHI when missing.
5. Backend computes cloud coverage and lightning probability and aggregates by
   day/month/year.
6. Frontend renders the charts.

## Deployment (Terraform)

- Infrastructure described as code under a future `infra/` (or `terraform/`)
  directory.
- Provision: frontend hosting, backend runtime, and the data store.
- Keep environments (dev/prod) parameterized; do not commit secrets.

## Milestones / Roadmap

1. **Scaffold** — frontend (React+TS) + backend (FastAPI) projects, dev
   container, OpenAPI-typed client. ✅ Done (see
   `docs/superpowers/plans/2026-05-28-scaffold.md`).
2. **SMHI integration** — fetch and parse historical data for a coordinate.
3. **Calculations** — cloud coverage + lightning probability.
4. **API** — expose metrics with day/month/year aggregation.
5. **Visualization** — charts in the frontend, address + location selection.
6. **Deployment** — Terraform for hosted environments.
7. **Bonus** — GitHub Actions CI/CD; AI forecasting.

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

_Last updated: 2026-05-28_

# elvy-map — Project Scaffold Design

**Date:** 2026-05-27
**Status:** Approved (design)
**Author:** Klas (with Claude)

## Purpose

Stand up a runnable full-stack skeleton for elvy-map so feature work (real SMHI
integration, charts, forecasting) has a working foundation. This spec covers
**only** the scaffold: project structure, tooling, dev container, and a
thin end-to-end vertical slice that proves the frontend and backend talk to each
other and a MapTiler map renders.

Source brief: `README-instructions.md`. Overall architecture: `ai-docs/PLANNING.md`.

## Scope

### In scope

- Monorepo layout (frontend + backend in one git repo).
- React + TypeScript frontend built with Vite.
- Python 3.12 FastAPI backend, dependencies managed with `uv`.
- Multi-service dev container via Docker Compose (backend + frontend).
- SQLite persistence layer, wired but minimally used.
- MapTiler SDK JS map rendering + address geocoding on the frontend.
- A thin vertical slice: frontend calls backend; `/health` passes; a stub
  metrics endpoint returns placeholder data; map renders.
- Linting/formatting and a minimal test for each side.
- Root `README.md` with run instructions.

### Out of scope (later specs)

- Real SMHI data download, parsing, and the cloud/lightning calculations.
- Charts / data visualization (per day/month/year).
- Terraform / GCP deployment.
- CI/CD (GitHub Actions).
- AI forecasting function.
- Postgres / Cloud SQL (SQLite now; migrate later).

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Repo layout | Monorepo, single git repo | One brief, tightly coupled FE/BE; simpler for now. |
| Frontend language | TypeScript | Per user. |
| Frontend build | Vite + `@vitejs/plugin-react` | Modern React+TS default, fast HMR. |
| Frontend package manager | npm | Ubiquitous, no extra setup. |
| Backend framework | FastAPI | Per user. |
| Python version | 3.12 | Current stable. |
| Python deps | `uv` (`pyproject.toml` + `uv.lock`) | Fast, modern, clean in containers. |
| Map rendering | MapTiler SDK JS + `@maptiler/geocoding-control` | Per user; simplest MapTiler integration, built-in geocoding. |
| Persistence | SQLite via SQLModel | Zero infra now; migrate to Postgres at GCP deploy time. |
| Dev environment | Dev container, Docker Compose, multi-service | Per user; mirrors prod topology, isolates services. |
| Node version | 20 LTS | Current LTS. |
| Backend lint/format | ruff | Single fast tool. |
| Frontend lint | eslint | Standard. |

## Repository Layout

```
elvy-map/
├── .devcontainer/
│   ├── devcontainer.json          # opens the compose stack, installs deps
│   └── docker-compose.yml         # backend + frontend services
├── backend/
│   ├── Dockerfile                 # python:3.12-slim + uv
│   ├── pyproject.toml             # deps + ruff/pytest config
│   ├── uv.lock
│   ├── .env.example               # backend settings (e.g. CORS origins)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                # FastAPI app, CORS, router include
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   └── config.py          # pydantic-settings, env-driven
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes.py          # GET /health, stub GET /api/metrics
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   └── session.py         # SQLite engine + session (SQLModel)
│   │   └── services/
│   │       ├── __init__.py
│   │       └── smhi.py            # placeholder SMHI client (httpx)
│   └── tests/
│       ├── __init__.py
│       └── test_health.py         # pytest + FastAPI TestClient
├── frontend/
│   ├── Dockerfile                 # node:20-slim, vite dev server
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── .env.example               # VITE_MAPTILER_KEY, VITE_API_URL
│   ├── .eslintrc.cjs
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   └── MapView.tsx        # MapTiler SDK map
│       └── lib/
│           └── api.ts             # typed fetch wrapper → backend
├── ai-docs/PLANNING.md            # exists
├── specs/                         # exists (feature specs)
├── docs/superpowers/specs/        # design docs (this file)
├── .gitignore
└── README.md
```

## Components

### Backend (FastAPI, Python 3.12, uv)

- **Runtime deps:** `fastapi`, `uvicorn[standard]`, `pydantic-settings`,
  `httpx`, `sqlmodel`.
- **Dev deps:** `pytest`, `ruff`.
- **`app/main.py`:** creates the FastAPI app, configures CORS for the Vite
  origin (from settings), includes the API router, initializes the SQLite DB on
  startup.
- **`app/core/config.py`:** `Settings` via `pydantic-settings`, reading from env
  (`.env`): e.g. `cors_origins`, `database_url` (defaults to a local SQLite
  file), `smhi_base_url`.
- **`app/api/routes.py`:**
  - `GET /health` → `{"status": "ok"}`.
  - `GET /api/metrics?lat=<float>&lon=<float>` → placeholder response shaped like
    the eventual real one, e.g. `{ "lat", "lon", "cloud_cover_pct": <stub>,
    "lightning_probability": <stub>, "note": "stub data" }`. This gives the
    frontend a real contract to call before SMHI is wired in.
- **`app/db/session.py`:** SQLModel engine against the SQLite URL, a
  `get_session` dependency, and `init_db()` to create tables. Lightly used now;
  exists so the caching layer has somewhere to grow.
- **`app/services/smhi.py`:** placeholder class/functions with an `httpx` client
  and clearly-marked TODOs for real endpoints. Returns stub values consumed by
  the metrics route.

### Frontend (React + TypeScript, Vite)

- **Runtime deps:** `react`, `react-dom`, `@maptiler/sdk`,
  `@maptiler/geocoding-control`.
- **Dev deps:** `typescript`, `vite`, `@vitejs/plugin-react`, `eslint` (+ React
  plugins), `@types/react`, `@types/react-dom`.
- **`src/components/MapView.tsx`:** initializes a MapTiler SDK `Map` using
  `VITE_MAPTILER_KEY`, default style and a Sweden-centered view; mounts the
  geocoding control so a typed address recenters the map and yields coordinates.
- **`src/lib/api.ts`:** typed `fetch` wrapper using `VITE_API_URL`; functions
  `getHealth()` and `getMetrics(lat, lon)` matching the backend contract.
- **`src/App.tsx`:** renders `MapView`, an address input (the geocoding
  control), and a small panel that calls `getMetrics` for the selected
  coordinates and shows the stub values. A visible "backend: ok/down" indicator
  using `getHealth()` confirms wiring.

### Dev Container (Docker Compose, multi-service)

- **`docker-compose.yml`:** two services —
  - `backend`: built from `backend/Dockerfile`, runs
    `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`,
    exposes 8000, workspace bind-mounted.
  - `frontend`: built from `frontend/Dockerfile`, runs `npm run dev -- --host`,
    exposes 5173, workspace bind-mounted.
  - Structured so a `db` (Postgres) service can be added later without
    reworking the topology.
- **`devcontainer.json`:** references the compose file, sets the primary service,
  forwards ports 8000/5173, and runs install commands (`uv sync` for backend,
  `npm install` for frontend) on create.

## Data Flow (scaffold maturity)

1. User types an address in the frontend; the MapTiler geocoding control
   resolves it to lat/lon and recenters the map.
2. Frontend calls `GET /api/metrics?lat=&lon=` via `lib/api.ts`.
3. Backend route calls `services/smhi.py` (stub) and returns placeholder
   cloud/lightning values in the real response shape.
4. Frontend displays the returned values.
5. Independently, the frontend calls `GET /health` on load and shows a
   backend-status indicator, proving end-to-end wiring.

No real SMHI requests are made yet; SQLite is initialized but not central.

## Error Handling

- Backend validates `lat`/`lon` as floats (FastAPI query validation); invalid
  input returns `422`.
- Frontend `lib/api.ts` surfaces network/non-2xx errors and the UI shows a
  "backend down" state rather than crashing.
- Missing `VITE_MAPTILER_KEY` produces a clear console/UI message instead of a
  blank map.

## Testing

- **Backend:** `pytest` with FastAPI `TestClient` — `test_health.py` asserts
  `GET /health` returns 200 `{"status":"ok"}`, plus a test that `GET /api/metrics`
  with valid coords returns 200 and the expected stub shape, and invalid coords
  return 422.
- **Frontend:** scaffold-level — `tsc --noEmit` type-check and `eslint` pass.
  (Component/integration tests deferred to feature specs.)
- **Manual:** `docker compose up` (or open in dev container); confirm map
  renders, address search works, backend-status shows "ok", and the metrics
  panel populates with stub data.

## Acceptance Criteria

1. `git`-tracked monorepo with the layout above.
2. Opening in the dev container (or `docker compose up`) starts both services
   without manual steps beyond providing a MapTiler key.
3. Frontend loads at `:5173`, renders a MapTiler map, and shows backend status
   "ok".
4. Address search recenters the map; the metrics panel shows stub data from the
   backend.
5. `uv run pytest` (backend) passes; `tsc --noEmit` and `eslint` (frontend) pass.
6. `README.md` documents setup (MapTiler key, running the stack, running tests).

## Open Items / Follow-up Specs

- Real SMHI integration (endpoints, station resolution, historical download).
- Cloud-cover and lightning-probability calculations.
- Charts (per day/month/year, monthly-over-a-year).
- Terraform + GCP deployment (incl. Postgres/Cloud SQL migration).
- CI/CD (GitHub Actions).
- AI forecasting.

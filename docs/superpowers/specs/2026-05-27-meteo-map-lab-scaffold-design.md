# meteo-map-lab — Project Scaffold Design

**Date:** 2026-05-27
**Status:** Approved (design)
**Author:** Klas (with Claude)

## Purpose

Stand up a runnable full-stack skeleton for meteo-map-lab so feature work (real SMHI
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
- Typed API contract: TypeScript interfaces generated from the FastAPI
  OpenAPI schema, consumed by a typed frontend client.
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
| API typing | FastAPI OpenAPI → `openapi-typescript` + `openapi-fetch` | Frontend types are generated from the backend contract, so they can't drift. |
| Dev environment | Dev container, Docker Compose, multi-service | Per user; mirrors prod topology, isolates services. |
| Node version | 20 LTS | Current LTS. |
| Backend lint/format | ruff | Single fast tool. |
| Frontend lint | eslint | Standard. |

## Repository Layout

```
meteo-map-lab/
├── .devcontainer/
│   ├── devcontainer.json          # opens the compose stack, installs deps
│   └── docker-compose.yml         # backend + frontend services
├── backend/
│   ├── Dockerfile                 # python:3.12-slim + uv
│   ├── pyproject.toml             # deps + ruff/pytest config
│   ├── uv.lock
│   ├── .env.example               # backend settings (e.g. CORS origins)
│   ├── openapi.json               # exported schema (committed, source for typegen)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                # FastAPI app, CORS, router include
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   └── config.py          # pydantic-settings, env-driven
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes.py          # GET /health, stub GET /api/metrics
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   └── metrics.py         # HealthResponse, MetricsResponse (Pydantic)
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   └── session.py         # SQLite engine + session (SQLModel)
│   │   └── services/
│   │       ├── __init__.py
│   │       └── smhi.py            # placeholder SMHI client (httpx)
│   ├── scripts/
│   │   └── export_openapi.py      # dumps app.openapi() → openapi.json
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
│           ├── api-schema.d.ts    # GENERATED from backend/openapi.json
│           └── api.ts             # openapi-fetch client typed by api-schema.d.ts
├── ai-docs/PLANNING.md            # exists
├── specs/                         # exists (feature specs)
├── docs/superpowers/specs/        # design docs (this file)
├── Makefile                       # up / test / gen-api orchestration
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
- **`app/schemas/metrics.py`:** Pydantic models that define the API contract and,
  through them, the OpenAPI schema:
  - `HealthResponse { status: str }`.
  - `MetricsResponse { lat: float, lon: float, cloud_cover_pct: float,
    lightning_probability: float, note: str }`.
- **`app/api/routes.py`:** routes declare these as `response_model` so FastAPI
  emits a fully-typed schema:
  - `GET /health` → `HealthResponse` (`{"status": "ok"}`).
  - `GET /api/metrics?lat=<float>&lon=<float>` → `MetricsResponse`, a placeholder
    shaped like the eventual real one. This gives the frontend a real, typed
    contract to call before SMHI is wired in.
- **OpenAPI:** FastAPI auto-serves the schema at `/openapi.json` and interactive
  docs at `/docs`. This schema is the single source of truth for the frontend
  types.
- **`scripts/export_openapi.py`:** imports the app and writes `app.openapi()` to
  `backend/openapi.json`. Runnable without a live server (`uv run python
  scripts/export_openapi.py`), so typegen and CI don't depend on a running
  backend. The committed `openapi.json` is regenerated whenever the contract
  changes.
- **`app/db/session.py`:** SQLModel engine against the SQLite URL, a
  `get_session` dependency, and `init_db()` to create tables. Lightly used now;
  exists so the caching layer has somewhere to grow.
- **`app/services/smhi.py`:** placeholder class/functions with an `httpx` client
  and clearly-marked TODOs for real endpoints. Returns stub values consumed by
  the metrics route.

### Frontend (React + TypeScript, Vite)

- **Runtime deps:** `react`, `react-dom`, `@maptiler/sdk`,
  `@maptiler/geocoding-control`, `openapi-fetch`.
- **Dev deps:** `typescript`, `vite`, `@vitejs/plugin-react`, `eslint` (+ React
  plugins), `@types/react`, `@types/react-dom`, `openapi-typescript`.
- **`src/lib/api-schema.d.ts`:** GENERATED by `openapi-typescript` from
  `backend/openapi.json` (committed). Never hand-edited.
- **`src/components/MapView.tsx`:** initializes a MapTiler SDK `Map` using
  `VITE_MAPTILER_KEY`, default style and a Sweden-centered view; mounts the
  geocoding control so a typed address recenters the map and yields coordinates.
- **`src/lib/api.ts`:** an `openapi-fetch` client created with `baseUrl =
  VITE_API_URL` and typed by `api-schema.d.ts`, so request paths, params, and
  response bodies are checked against the backend contract. Exposes
  `getHealth()` and `getMetrics(lat, lon)` whose return types are derived from
  the generated schema (no hand-written interfaces).
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
- **Dependency install:** each service installs its own deps in its own
  Dockerfile (`uv sync` in `backend/Dockerfile`, `npm install` in
  `frontend/Dockerfile`), so a build leaves both services ready. The committed
  generated types mean the frontend type-checks on first open without a regen
  step.
- **`devcontainer.json`:** references the compose file, sets the primary service,
  and forwards ports 8000/5173.

### API Type Generation

The frontend's types are derived from the backend's OpenAPI schema, so the two
can't drift. The pipeline is two steps that live in **different toolchains**, so
each runs in its own environment:

1. **Export schema (backend env — Python/uv):** `uv run python
   scripts/export_openapi.py` writes `backend/openapi.json`.
2. **Generate types (frontend env — Node):** the `gen:types` npm script runs
   `openapi-typescript ../backend/openapi.json -o src/lib/api-schema.d.ts`. This
   reads the committed `openapi.json`, so it needs only Node — no Python.

A root **`Makefile`** target `make gen-api` orchestrates both across the two
services (run from the host, or via `docker compose exec` into each service), so
there's still a single command for the full regen. Inside a single container,
run whichever step that container's toolchain supports.

Regenerate after any change to a route or response model. Both
`backend/openapi.json` and `frontend/src/lib/api-schema.d.ts` are committed so a
fresh checkout type-checks without first running the backend. A future CI step
can run `make gen-api` and fail if the committed files are stale.

## Data Flow (scaffold maturity)

1. User types an address in the frontend; the MapTiler geocoding control
   resolves it to lat/lon and recenters the map.
2. Frontend calls `GET /api/metrics?lat=&lon=` via the typed `lib/api.ts`
   client (path, params, and response type checked against the generated schema).
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
- **Frontend:** scaffold-level — `tsc --noEmit` type-check and `eslint` pass,
  which exercises the generated API types (a contract mismatch fails the build).
  (Component/integration tests deferred to feature specs.)
- **Schema freshness:** running `make gen-api` produces no diff in
  `backend/openapi.json` or `frontend/src/lib/api-schema.d.ts` (committed
  artifacts match the code).
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
6. `make gen-api` regenerates the schema + types with no diff against the
   committed files.
7. `README.md` documents setup (MapTiler key, running the stack, running tests,
   regenerating API types).

## Open Items / Follow-up Specs

- Real SMHI integration (endpoints, station resolution, historical download).
- Cloud-cover and lightning-probability calculations.
- Charts (per day/month/year, monthly-over-a-year).
- Terraform + GCP deployment (incl. Postgres/Cloud SQL migration).
- CI/CD (GitHub Actions).
- AI forecasting.

# elvy-map

React + TypeScript frontend and FastAPI backend that uses SMHI data to analyze
cloud coverage and lightning-strike probability for a location. See the brief in
`README-instructions.md` and architecture in `ai-docs/PLANNING.md`.

## Prerequisites

- Docker + Docker Compose v2
- A MapTiler API key — https://cloud.maptiler.com/account/keys/

## Setup

```bash
cp frontend/.env.example frontend/.env   # set VITE_MAPTILER_KEY
cp backend/.env.example backend/.env     # optional; defaults are fine
```

## Run (dev container / compose)

```bash
make up          # docker compose up --build
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000 (docs at /docs)

Or open the folder in VS Code and "Reopen in Container".

> Ports 5173 and 8000 must be free on the host. If another dev server is using
> 5173, stop it first (or it will fail to bind).

## Tests

With the stack running (`make up` in another terminal):

```bash
make test        # backend pytest + frontend typecheck/lint
```

## Regenerating API types

The frontend's types are generated from the backend's OpenAPI schema:

```bash
make gen-api     # export backend/openapi.json, then regenerate
                 # frontend/src/lib/api-schema.d.ts
```

Run this after changing any route or response model, and commit the updated
`openapi.json` and `api-schema.d.ts`.

## Out of scope (later)

Real SMHI integration, charts, Terraform/GCP deploy, CI/CD, AI forecasting.

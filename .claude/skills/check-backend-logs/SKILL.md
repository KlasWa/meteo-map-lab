---
name: check-backend-logs
description: Use when checking the meteo-map-lab backend for runtime errors — after starting the stack with make up/debug, when the frontend shows a backend/500 error, after a backend code or model change, or when asked to "check the backend logs". Scans the backend container's docker compose logs for tracebacks, HTTP 5xx, and SQL errors.
---

# Check Backend Logs

The backend runs as the `backend` service (container `backend-1`) under the dev
compose file. Runtime errors (tracebacks, 500s) appear only in its container
logs, not in the test suite.

## Quick reference

```bash
# Compose alias used below (same as the Makefile):
C="docker compose -f .devcontainer/docker-compose.yml"

# Scan recent logs for errors (start here):
$C logs backend --tail=200 --no-color 2>&1 \
  | grep -nE "ERROR|Traceback|Exception|raise |[45][0-9][0-9] Internal|sqlite3\.|sqlalchemy\.exc|UNIQUE|no such column"

# Read full recent context once an error is found:
$C logs backend --tail=400 --no-color

# For a DB error, pull the failing SQL + bound parameters:
$C logs backend --tail=400 --no-color 2>&1 | grep -E "\[SQL:|\[parameters:|constraint failed|no such column"

# Follow live while reproducing from the UI:
$C logs -f backend
```

## Reading the result

- Read the **last** traceback first — logs are chronological; the newest error is
  at the bottom. The same request often logs the SQLAlchemy chain twice (DBAPI
  error, then the wrapped `sqlalchemy.exc.*`).
- The first `File ".../app/..."` frame from the bottom is the project code that
  triggered it; library frames above it are usually noise.
- For DB errors, the `[parameters: (...)]` line shows the exact offending row.

## Common errors (this project)

- `no such column: <table>.<col>` → on-disk SQLite cache has a stale schema after
  a model change. Fix: `make reset-db` (there is no migration tool; the DB is a
  regenerable cache).
- `UNIQUE constraint failed` on insert → a select-then-insert race under
  concurrent requests (the frontend fetches params in parallel; dev StrictMode
  double-fires). Fix the write to be an idempotent upsert.
- `500` with `NoStationFound`/`SMHIUnavailable` should be 404/503 instead → the
  exception isn't mapped in the route handler.

A clean run shows `Application startup complete.` and `200 OK` lines with no
`Traceback`.

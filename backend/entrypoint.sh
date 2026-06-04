#!/bin/sh
set -e

# Local-dev escape hatch: skip Litestream entirely so the image can be
# smoke-tested without GCS credentials. Cloud Run never sets this variable,
# so production behavior is unchanged.
if [ "${SKIP_LITESTREAM:-0}" = "1" ]; then
  echo "SKIP_LITESTREAM=1 — running uvicorn without Litestream replication"
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

# Restore the latest replica from GCS into the writable tmpfs volume. The
# -if-replica-exists flag makes this a clean no-op when the configured
# replica is empty, but Litestream still needs ADC to talk to GCS — set
# SKIP_LITESTREAM=1 instead for local runs without credentials.
litestream restore -if-replica-exists -config /etc/litestream.yml /data/meteo_map_lab.db

# Run the API under Litestream's `replicate -exec` wrapper. Litestream stays
# PID 1, streams the SQLite WAL to GCS in the background, and forwards
# signals to uvicorn so a graceful Cloud Run shutdown flushes the WAL.
exec litestream replicate -config /etc/litestream.yml \
  -exec "uvicorn app.main:app --host 0.0.0.0 --port 8000"

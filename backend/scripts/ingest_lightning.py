"""Warm the lightning cache by ensuring all day-files in the retained window are
fetched. Run via `make ingest-lightning`. Safe to re-run (idempotent)."""

import sys
from pathlib import Path

_backend_root = Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from app.core.config import settings  # noqa: E402
from app.db.session import engine, init_db  # noqa: E402
from app.repositories.lightning_sqlite import SqliteLightningRepository  # noqa: E402
from app.services.lightning import LightningService  # noqa: E402
from app.services.lightning_client import LightningClient  # noqa: E402


def main() -> None:
    init_db()
    svc = LightningService(
        LightningClient(base_url=settings.lightning_base_url),
        SqliteLightningRepository(engine),
        settings,
    )
    # Any coordinate warms every day (ensure_days is location-independent).
    resp = svc.get_lightning(62.0, 15.0, "monthly")
    print(f"Lightning cache warmed. stale={resp.stale}, buckets={len(resp.points)}")


if __name__ == "__main__":
    main()

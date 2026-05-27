"""Export the FastAPI OpenAPI schema to backend/openapi.json."""

import json
import sys
from pathlib import Path

# Ensure the backend root (parent of this scripts/ dir) is on sys.path so that
# `from app.main import app` works when the script is run via:
#   cd backend && uv run python scripts/export_openapi.py
_backend_root = Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from app.main import app  # noqa: E402


def main() -> None:
    schema = app.openapi()
    out = _backend_root / "openapi.json"
    out.write_text(json.dumps(schema, indent=2) + "\n")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()

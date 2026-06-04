import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import init_db

configure_logging()
_logger = logging.getLogger("app.request")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def build_app(cors_origins: str) -> FastAPI:
    """Build the FastAPI app with a comma-separated CORS allowlist. An empty
    `cors_origins` yields no allowed origins — used on first deploy before the
    frontend URL is known. Factored out so tests can drive different inputs."""
    api = FastAPI(title="meteo-map-lab API", version="0.1.0", lifespan=lifespan)

    origins = [o.strip() for o in cors_origins.split(",") if o.strip()]
    api.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Per-request timing. Cloud Logging picks up the `extra` fields as
    # jsonPayload.* (via JsonFormatter); filter for slow paths with
    # `jsonPayload.duration_ms > 500`.
    @api.middleware("http")
    async def request_timing(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        _logger.info(
            "request_complete",
            extra={
                "path": request.url.path,
                "method": request.method,
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response

    api.include_router(router)
    return api


app = build_app(settings.cors_origins)

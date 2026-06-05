import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.trace import parse_cloud_trace_header, set_trace_id, trace_field
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

    # Per-request timing + Cloud Trace correlation. We stash the inbound
    # trace ID in a contextvar so outbound_request logs (issued inside route
    # handlers) can carry the same trace, letting Cloud Logging visually
    # group "one Cloud Run access entry → one request_complete → N
    # outbound_request" entries under a single trace.
    @api.middleware("http")
    async def request_timing(request: Request, call_next):
        set_trace_id(parse_cloud_trace_header(
            request.headers.get("x-cloud-trace-context", "")
        ))
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        extra: dict[str, object] = {
            "path": request.url.path,
            "method": request.method,
            "status": response.status_code,
            "duration_ms": duration_ms,
        }
        tf = trace_field()
        if tf is not None:
            extra["logging.googleapis.com/trace"] = tf
        _logger.info("request_complete", extra=extra)
        return response

    api.include_router(router)
    return api


app = build_app(settings.cors_origins)

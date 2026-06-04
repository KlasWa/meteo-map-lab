from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.db.session import init_db


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

    api.include_router(router)
    return api


app = build_app(settings.cors_origins)

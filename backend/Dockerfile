FROM python:3.12-slim

# uv binary
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Keep the virtualenv outside the bind-mounted workspace so it survives mounts.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_COMPILE_BYTECODE=1

WORKDIR /workspace/backend

# Install deps first for layer caching (built with context = repo root).
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

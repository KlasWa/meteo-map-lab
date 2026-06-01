COMPOSE = docker compose -f .devcontainer/docker-compose.yml
COMPOSE_DEBUG = docker compose -f .devcontainer/docker-compose.yml -f .devcontainer/docker-compose.debug.yml

.PHONY: up down rebuild debug test gen-schema gen-types gen-api

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

# Like `up`, but the backend runs under debugpy (port 5678) and waits for a
# debugger to attach before starting. Use VS Code's "Attach to API (Docker)"
# launch config. The frontend still runs normally.
debug:
	$(COMPOSE_DEBUG) up --build

# Drop anonymous volumes (notably frontend node_modules) and bring the stack
# back up. Use this when package.json / pyproject.toml deps change, otherwise
# the stale anonymous volume shadows the rebuilt image's fresh deps.
rebuild:
	$(COMPOSE) down -v
	$(COMPOSE) up --build

# Regenerate the OpenAPI schema (backend toolchain).
gen-schema:
	$(COMPOSE) exec -T backend uv run python scripts/export_openapi.py

# Regenerate the TypeScript types from the committed schema (frontend toolchain).
gen-types:
	$(COMPOSE) exec -T frontend npm run gen:types

# Full regen: schema then types.
gen-api: gen-schema gen-types

# Run backend tests and frontend type-check + lint.
test:
	$(COMPOSE) exec -T backend uv run pytest
	$(COMPOSE) exec -T frontend sh -lc "npm run typecheck && npm run lint"

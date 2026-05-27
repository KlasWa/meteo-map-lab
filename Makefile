COMPOSE = docker compose -f .devcontainer/docker-compose.yml

.PHONY: up down test gen-schema gen-types gen-api

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

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

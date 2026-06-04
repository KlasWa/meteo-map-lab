# GCP Deploy: Cloud Run + Litestream + GitHub Actions — Design

> Status: approved (brainstorm). Date: 2026-06-01.
> Source brief: [`README-instructions.md`](../../../README-instructions.md) ·
> Architecture: [`ai-docs/PLANNING.md`](../../../ai-docs/PLANNING.md)

## 1. Scope & Goal

Stand up a production deployment of meteo-map-lab on GCP, provisioned with
Terraform, deployed by GitHub Actions, with SQLite preserved as the
runtime database via Litestream → GCS replication.

**In scope**

- Two Cloud Run services in `europe-north1`: backend (FastAPI + Uvicorn +
  Litestream wrapper) and frontend (nginx serving a Vite build).
- SQLite on an in-memory tmpfs volume, continuously replicated to GCS by
  Litestream; restored on container start.
- Terraform-managed infrastructure: Artifact Registry, GCS replica bucket,
  GCS Terraform-state bucket, Secret Manager, service accounts and IAM
  bindings, Cloud Run services, Workload Identity Federation for GitHub.
- GitHub Actions workflows: PR test/lint + plan; main-branch build/push/apply.
- A one-time `infra/bootstrap/` Terraform module run locally to create the
  state bucket and the WIF pool/provider; everything else runs from CI.

**Out of scope (future specs)**

- Custom domain + managed TLS on Cloud Run (trivial follow-up; uses Cloud
  Run domain mappings — no Load Balancer needed).
- Cloud Monitoring alerting / uptime checks / budget alerts beyond a single
  default budget.
- Horizontal scaling of the backend (incompatible with single-writer SQLite;
  a separate spec would migrate to Cloud SQL if needed).
- Staging environment (same recipe, separate project; do later if needed).
- AI forecasting service and any infra it requires.

## 2. Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Region | `europe-north1` (Stockholm) | Closest to SMHI + Swedish users; low egress to .se. |
| Compute | Cloud Run (2nd gen) for both services | Scale-to-zero on FE, scale-to-one on BE; no cluster. |
| Database | SQLite + Litestream → GCS | Avoids Cloud SQL's ~€10–25/mo floor; fits read-heavy cached workload. |
| BE instance bounds | `min_instances = 1`, `max_instances = 1` | SQLite needs a single writer; `min=1` keeps Litestream replicating continuously. |
| BE volume | tmpfs at `/data` | Fast, ephemeral; Litestream restores from GCS on start. |
| FE instance bounds | `min = 0`, `max = 4` | Static assets via nginx — scale-to-zero is fine, no shared state. |
| Frontend URL injection | Sequenced deploy: BE first, capture URL, build FE image with `VITE_API_URL` baked in | Vite is build-time; sequencing keeps both URLs stable. |
| Container registry | Artifact Registry, regional | Native to Cloud Run; private; per-image size unbounded under free tier for low usage. |
| Secrets | Secret Manager (MapTiler key) | First 6 secrets free; pulled at FE build time in CI. |
| Auth (CI → GCP) | Workload Identity Federation (OIDC) | No JSON keys in repo secrets. |
| TF state | GCS bucket, versioned | Standard; locks via GCS object generation. |
| TF layout | `infra/bootstrap/` (local, one-time) + `infra/` (from CI) | Bootstrap creates state bucket + WIF pool; CI can't create what authenticates it. |
| Logging | Cloud Logging defaults | < 50 GiB/mo is free; structured logs from FastAPI. |
| FE host | Cloud Run (nginx) | Free at this traffic; uniform pipeline; no Firebase product surface. |

## 3. Architecture & Topology

```
GitHub Actions (OIDC token)
        │
        ├── auth via Workload Identity Federation ──▶ google.com/iam
        │
        ├── docker build/push (backend, frontend) ──▶ Artifact Registry (europe-north1)
        ├── terraform apply ──▶ Cloud Run, IAM, Secrets, GCS, ...
        └── gcloud run deploy (revision swap) ──▶ Cloud Run revisions

europe-north1
        ├── Cloud Run: meteo-map-lab-backend (min=1, max=1, 0.25 vCPU / 512 MiB)
        │     ├── tmpfs /data ──▶ /data/meteo_map_lab.db (SQLite)
        │     └── litestream replicate -exec "uvicorn ..."
        │                │
        │                └──▶ GCS bucket: meteo-map-lab-litestream  (versioned, lifecycle)
        │
        ├── Cloud Run: meteo-map-lab-frontend (min=0, max=4, 0.25 vCPU / 256 MiB)
        │     └── nginx ──▶ Vite-built dist/ (VITE_API_URL baked at build)
        │
        ├── Artifact Registry repo: meteo-map-lab
        ├── Secret Manager: maptiler-key
        └── GCS buckets:
              ├── meteo-map-lab-litestream    (Litestream replica)
              └── meteo-map-lab-tfstate       (Terraform state)
```

Both Cloud Run services are public (`--allow-unauthenticated`). The
frontend calls the backend's `*.run.app` URL directly. CORS on the backend
allows the frontend's origin (configured via env at deploy time).

## 4. GCP Project & Terraform Layout

```
infra/
  bootstrap/                # run locally, once
    main.tf                 # GCS state bucket, WIF pool + provider,
                            # CI service account, project APIs (terraform's only)
    variables.tf
    outputs.tf              # workload_identity_provider, ci_service_account_email

  main/                     # run from CI
    backend.tf              # backend "gcs" → bucket created by bootstrap
    providers.tf            # google + google-beta
    apis.tf                 # enable APIs: run, sqladmin (no — skip), artifactregistry,
                            #              secretmanager, storage, iam, logging
    artifact_registry.tf
    secrets.tf              # maptiler-key (value out-of-band; CI grants access)
    iam.tf                  # runtime SAs for BE/FE, bindings
    storage.tf              # meteo-map-lab-litestream bucket (+ lifecycle, versioning)
    cloud_run_backend.tf    # min=1 max=1, tmpfs /data, SA binding, env vars
    cloud_run_frontend.tf   # min=0 max=4, SA binding
    outputs.tf              # backend_url, frontend_url

  modules/                  # optional; inline first, extract if duplicated
    cloud_run_service/
```

**Bootstrap inputs:** GCP project ID, GitHub repo (`KlasWa/meteo-map-lab`),
billing account ID. It creates:

- GCS bucket `meteo-map-lab-tfstate` (versioned, uniform access).
- IAM workload identity pool `github` with provider for `KlasWa/meteo-map-lab`.
- Service account `tf-deployer@…` granted the minimum roles to create
  everything in `main/`: `roles/run.admin`, `roles/iam.serviceAccountAdmin`,
  `roles/secretmanager.admin`, `roles/storage.admin`,
  `roles/artifactregistry.admin`, `roles/serviceusage.serviceUsageAdmin`,
  `roles/iam.workloadIdentityPoolAdmin`.
- WIF binding so `repo:KlasWa/meteo-map-lab:ref:refs/heads/main` (and PR refs
  for plan-only) can impersonate `tf-deployer@…`.

Outputs are written to `bootstrap-outputs.json` (gitignored) and the
relevant fields copied into GitHub repo secrets:

- `GCP_PROJECT_ID`
- `GCP_WIF_PROVIDER` (full resource name)
- `GCP_CI_SA_EMAIL`

## 5. Backend Container Changes

### 5.1 `backend/Dockerfile` (production stage)

A new multi-stage build that produces a production image. The dev
Dockerfile stays for local compose use; production has a separate target
(or a separate `Dockerfile.prod`).

```dockerfile
FROM python:3.12-slim AS deps
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_COMPILE_BYTECODE=1
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim
COPY --from=deps /opt/venv /opt/venv
COPY --from=litestream/litestream:0.3 /usr/local/bin/litestream /usr/local/bin/litestream
ENV PATH="/opt/venv/bin:${PATH}"
WORKDIR /app
COPY backend/app ./app
COPY backend/litestream.yml /etc/litestream.yml
COPY backend/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

### 5.2 `backend/entrypoint.sh`

```sh
#!/bin/sh
set -e
# Restore latest replica into the writable volume; -if-replica-exists makes
# this a no-op on first ever deploy (empty bucket).
litestream restore -if-replica-exists -config /etc/litestream.yml /data/meteo_map_lab.db
# Replicate continuously while running the API.
exec litestream replicate -config /etc/litestream.yml \
  -exec "uvicorn app.main:app --host 0.0.0.0 --port 8000"
```

### 5.3 `backend/litestream.yml`

```yaml
dbs:
  - path: /data/meteo_map_lab.db
    replicas:
      - type: gcs
        bucket: ${LITESTREAM_BUCKET}
        path: meteo_map_lab
        retention: 168h        # 7 days of generations
        snapshot-interval: 24h
        sync-interval: 1s
```

`GOOGLE_APPLICATION_CREDENTIALS` isn't needed; Litestream uses the Cloud
Run service identity (Application Default Credentials).

### 5.4 App config

- `DATABASE_URL=sqlite:////data/meteo_map_lab.db` (env var on the Cloud Run service).
- `CORS_ORIGINS=https://<frontend-url>` (env var, populated by Terraform
  from the FE Cloud Run service output).
- No `--reload` in production CMD.

### 5.5 Cloud Run service config (Terraform-shaped)

- 2nd-gen execution environment.
- CPU: 0.25 vCPU, Memory: 512 MiB.
- `min_instance_count = 1`, `max_instance_count = 1`.
- Concurrency: 80 (default).
- Volume: `empty_dir { medium = "MEMORY" size_limit = "512Mi" }` mounted
  at `/data`.
- Service account: `meteo-map-lab-backend@…` with
  `roles/storage.objectAdmin` scoped to the `meteo-map-lab-litestream` bucket.

## 6. Frontend Container Changes

### 6.1 `frontend/Dockerfile.prod`

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci
COPY frontend/ .
ARG VITE_API_URL
ARG VITE_MAPTILER_KEY
ENV VITE_API_URL=${VITE_API_URL} VITE_MAPTILER_KEY=${VITE_MAPTILER_KEY}
RUN npm run build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
```

### 6.2 `frontend/nginx.conf`

```nginx
server {
  listen 8080 default_server;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri /index.html; }   # SPA fallback
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
}
```

(Cloud Run requires the container to listen on `$PORT`; defaulting to
8080 matches the platform default and avoids needing to template the port.)

### 6.3 Cloud Run service config

- 0.25 vCPU, 256 MiB.
- `min_instance_count = 0`, `max_instance_count = 4`.
- No SA permissions beyond default (static content only).

## 7. CI/CD

Two workflows in `.github/workflows/`:

### 7.1 `test.yml` — runs on every PR

```yaml
on: [pull_request]
jobs:
  backend:
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync
        working-directory: backend
      - run: uv run pytest
        working-directory: backend
  frontend:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc' }
      - run: npm ci
        working-directory: frontend
      - run: npm run typecheck && npm run lint
        working-directory: frontend
  terraform-plan:
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WIF_PROVIDER }}
          service_account: ${{ secrets.GCP_CI_SA_EMAIL }}
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init && terraform plan -no-color
        working-directory: infra/main
```

The plan output is posted as a sticky PR comment (any plan-comment action).

### 7.2 `deploy.yml` — runs on push to `main`

```yaml
on:
  push:
    branches: [main]
jobs:
  deploy:
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WIF_PROVIDER }}
          service_account: ${{ secrets.GCP_CI_SA_EMAIL }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud auth configure-docker europe-north1-docker.pkg.dev

      # Step 1: apply infra except the FE service (no chicken/egg with the
      # FE image — apply ensures BE exists; FE image is built next).
      - run: terraform init && terraform apply -auto-approve -target=...
        working-directory: infra/main
      # (In practice: structure as two apply passes, see "Sequencing" below.)

      # Step 2: build + push backend
      - run: |
          docker build -t europe-north1-docker.pkg.dev/$PROJECT/meteo-map-lab/backend:$SHA \
            -f backend/Dockerfile.prod .
          docker push europe-north1-docker.pkg.dev/$PROJECT/meteo-map-lab/backend:$SHA
      - run: gcloud run deploy meteo-map-lab-backend --image=...:$SHA --region=europe-north1

      # Step 3: read backend URL, build FE with it baked in
      - id: be-url
        run: |
          URL=$(gcloud run services describe meteo-map-lab-backend \
                  --region=europe-north1 --format='value(status.url)')
          echo "url=$URL" >> $GITHUB_OUTPUT
      - run: |
          MAPTILER=$(gcloud secrets versions access latest --secret=maptiler-key)
          docker build -t europe-north1-docker.pkg.dev/$PROJECT/meteo-map-lab/frontend:$SHA \
            --build-arg VITE_API_URL="${{ steps.be-url.outputs.url }}" \
            --build-arg VITE_MAPTILER_KEY="$MAPTILER" \
            -f frontend/Dockerfile.prod .
          docker push europe-north1-docker.pkg.dev/$PROJECT/meteo-map-lab/frontend:$SHA
      - run: gcloud run deploy meteo-map-lab-frontend --image=...:$SHA --region=europe-north1

      # Step 4: final terraform apply (idempotent; reconciles env vars like
      # CORS_ORIGINS after FE URL is known)
      - run: terraform apply -auto-approve
        working-directory: infra/main
```

### 7.3 Sequencing (the chicken-and-egg)

The FE image needs the BE URL; the BE service needs CORS to allow the FE
URL. We resolve this in two passes:

1. **TF apply A** — create everything except set `CORS_ORIGINS` on the BE.
2. **Build/push BE image; deploy BE revision.**
3. **Read BE URL from Cloud Run.**
4. **Build/push FE image with `VITE_API_URL` baked in; deploy FE revision.**
5. **Read FE URL; TF apply B** — sets BE `CORS_ORIGINS` to the FE URL.

After the first successful deploy, both URLs are stable, so subsequent
runs are effectively a single apply + two image swaps.

Custom domains (future) would eliminate this dance: BE/FE URLs become
constants known at TF-write time.

## 8. Cost Estimate (europe-north1, monthly)

| Item | Sizing | Est. €/mo |
| --- | --- | --- |
| Cloud Run backend (always-on) | 0.25 vCPU, 512 MiB, `min=1` | ~€5–7 |
| Cloud Run frontend | scale-to-zero, ~10k req/mo | €0 (free tier) |
| GCS Litestream replica | < 1 GB, versioned | < €0.10 |
| GCS operations (Litestream + TF) | low | < €0.50 |
| GCS Terraform state | < 100 MB | < €0.05 |
| Artifact Registry | < 1 GB images | €0 (free tier) |
| Secret Manager | 1 secret, low access | €0 (free tier) |
| Cloud Logging | low volume | €0 (under 50 GiB free) |
| Egress to internet | small | €0–1 |
| **Total** | | **~€6–9/mo** |

GitHub Actions: free for public repos; private repos get 2 000 min/mo
free on personal accounts — well within reach.

## 9. Risks & Mitigations

- **Cloud Run terminates BE ungracefully → up to ~1s of un-replicated
  writes lost.** Litestream `sync-interval: 1s` bounds the window. SMHI
  cache data is recoverable on next fetch. For non-recoverable data,
  re-evaluate.
- **Single-writer cap on BE.** Vertical scaling only. If concurrent users
  push the single instance over CPU, bump CPU/RAM. Migrating off SQLite is
  a separate spec.
- **`min_instances = 1` foregoes scale-to-zero on BE.** This is the
  primary cost line; the trade is intentional.
- **Deploy-time blip.** Cloud Run swaps revisions atomically but a single
  instance means in-flight requests on the old revision may see brief
  errors. Acceptable for a single-user app.
- **Litestream binary becomes unavailable / unmaintained.** Pin a specific
  version tag; the image is otherwise self-contained.
- **Build-time env vars (`VITE_API_URL`) baked into FE image.** Changing
  the BE URL requires a FE rebuild. Mitigated by stable URLs + custom
  domain as the polish step.
- **GCS replica bucket deleted accidentally.** Versioning + bucket-level
  IAM (only the BE SA writes; only humans with project owner can delete).
  Lifecycle keeps coldline copies for 90 days.
- **WIF misconfiguration → CI can't auth.** Bootstrap module outputs the
  exact resource names; tested manually before first CI run.

## 10. Open Questions / Future Work

- **Custom domain.** Probably `meteo-map-lab.app` or similar. Adds a domain
  mapping per service + DNS records; TLS managed by Google. ~€1/mo for
  registration. Eliminates the FE rebuild-on-BE-URL-change problem.
- **Staging environment.** Same Terraform in a second project; `infra/`
  takes a workspace per env. Likely overkill until there are multiple
  developers.
- **Cloud Monitoring + budget alerts.** Add a €10/mo budget alert from
  day one. Uptime check on `GET /health`.
- **Backup verification.** Periodic `litestream restore` to a side path
  with checksum compare, on a schedule. Out of scope for v1.
- **Migration path to Cloud SQL.** If single-writer becomes a bottleneck,
  the abstraction at `app/repositories/` (already designed swappable in
  the cloud-cover spec) makes the change a connection-string + driver
  swap plus a one-time data export/import.

---

## Decision pending before implementation

None — proceeding to plan. The plan doc will sequence:

1. `infra/bootstrap/` (local apply, capture outputs into GitHub secrets).
2. `infra/main/` skeleton (providers, APIs, AR, GCS, Secret Manager).
3. Backend production Dockerfile + Litestream wrapper + entrypoint.
4. Backend Cloud Run resource + first manual apply.
5. Frontend production Dockerfile + nginx config.
6. Frontend Cloud Run resource + first manual apply (with placeholder URL).
7. `.github/workflows/test.yml` and `.github/workflows/deploy.yml`.
8. End-to-end run on a real branch → main merge → verified live URLs.

# GCP Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship meteo-map-lab to GCP. Two Cloud Run services in `europe-north1`, SQLite preserved via Litestream → GCS replication, Terraform-managed infra, GitHub Actions CI/CD authenticated via Workload Identity Federation.

**Architecture summary:** Backend Cloud Run service pinned to a single always-on instance (single-writer SQLite); SQLite file lives on a tmpfs volume and is restored / continuously replicated to a versioned GCS bucket by Litestream. Frontend Cloud Run service is an nginx image serving the Vite build with `VITE_API_URL` baked in at build time. Two Terraform modules: `infra/bootstrap/` is run locally once (state bucket + WIF + CI service account), `infra/main/` runs from CI.

**Tech Stack:** Terraform ≥ 1.6 with `hashicorp/google` provider, Cloud Run (2nd gen), Artifact Registry, Cloud Storage, Secret Manager, IAM, Litestream 0.3.x, nginx 1.27-alpine, GitHub Actions with `google-github-actions/auth@v2`.

**Reference:** Design spec at `docs/superpowers/specs/2026-06-01-gcp-cloud-run-litestream-deploy-design.md`. Refer to its sections for the rationale behind each choice; this plan only lists the steps.

**Conventions for every task:**
- All Terraform commands run from the relevant module directory (`infra/bootstrap/` or `infra/main/`).
- `terraform fmt -recursive infra/` before every commit; `terraform validate` before opening a PR.
- Image tags use the short commit SHA (`${GITHUB_SHA::7}`).
- Region constant: `europe-north1`. Project ID is `var.project_id`.
- Commit after each task.

---

## Prerequisites (one-time, manual, off-repo)

These exist outside Terraform because Terraform can't bootstrap its own
authentication.

- [ ] Create a new GCP project (e.g. `meteo-map-lab-prod`) under a billing
      account in the GCP Console. Note the project ID.
- [ ] Enable billing on the project.
- [ ] Install Terraform ≥ 1.6 and `gcloud` locally; `gcloud auth
      application-default login` so the bootstrap module can authenticate.

---

## File Structure

**Create:**

- `infra/bootstrap/main.tf` — GCS state bucket, WIF pool + provider, CI service account, role grants, base APIs.
- `infra/bootstrap/variables.tf` — `project_id`, `region`, `github_repo`.
- `infra/bootstrap/outputs.tf` — `state_bucket`, `workload_identity_provider`, `ci_service_account_email`.
- `infra/bootstrap/terraform.tfvars.example` — sample values.

- `infra/main/backend.tf` — GCS `state_bucket` reference.
- `infra/main/providers.tf` — `google` + `google-beta`.
- `infra/main/apis.tf` — enable Cloud Run, Artifact Registry, Secret Manager, Cloud Storage, IAM, Cloud Logging.
- `infra/main/variables.tf` — `project_id`, `region`, `image_backend`, `image_frontend`, `cors_origins`.
- `infra/main/artifact_registry.tf` — repo `meteo-map-lab`.
- `infra/main/secrets.tf` — `maptiler-key` secret (value supplied out-of-band).
- `infra/main/storage.tf` — `meteo-map-lab-litestream` bucket (versioning, lifecycle).
- `infra/main/iam.tf` — runtime service accounts + bindings (BE SA → bucket; CI SA → secret access at build time).
- `infra/main/cloud_run_backend.tf` — backend service.
- `infra/main/cloud_run_frontend.tf` — frontend service.
- `infra/main/outputs.tf` — `backend_url`, `frontend_url`, `litestream_bucket`, `artifact_repo`.

- `backend/Dockerfile.prod` — multi-stage production image with Litestream.
- `backend/entrypoint.sh` — `litestream restore` then `litestream replicate -exec uvicorn`.
- `backend/litestream.yml` — GCS replica config.

- `frontend/Dockerfile.prod` — Vite build → nginx-alpine.
- `frontend/nginx.conf` — SPA fallback + long-cache for `/assets/`.

- `.github/workflows/test.yml` — PR: backend tests, frontend typecheck/lint, `terraform plan`.
- `.github/workflows/deploy.yml` — main: build/push images, two-pass `terraform apply`.

**Modify:**

- `backend/app/main.py` — read `cors_origins` from env (already wired via Settings; verify).
- `backend/app/core/config.py` — confirm `database_url` / `cors_origins` are env-overridable.
- `.gitignore` — add `**/.terraform/`, `**/*.tfstate*`, `infra/bootstrap/bootstrap-outputs.json`.
- `README.md` — short "Deploy" section pointing at the spec.
- `ai-docs/PLANNING.md` — flip the deploy milestone status when complete.

---

## Task 1: Bootstrap Terraform

**Files:**
- Create: `infra/bootstrap/main.tf`, `variables.tf`, `outputs.tf`, `terraform.tfvars.example`

- [ ] **Step 1: Write the bootstrap module.**
      Resources: `google_project_service` for IAM/Storage/IAM-Credentials; `google_storage_bucket` for `${var.project_id}-tfstate` (versioning on, uniform access, lifecycle to delete noncurrent after 90d); `google_iam_workload_identity_pool` `github`; `google_iam_workload_identity_pool_provider` `github-actions` with `attribute_condition = "assertion.repository == '${var.github_repo}'"`; `google_service_account` `tf-deployer`; grants `roles/run.admin`, `roles/iam.serviceAccountAdmin`, `roles/secretmanager.admin`, `roles/storage.admin`, `roles/artifactregistry.admin`, `roles/serviceusage.serviceUsageAdmin`, `roles/iam.workloadIdentityPoolAdmin`; `google_service_account_iam_member` binding `roles/iam.workloadIdentityUser` so any workflow on `repo:${var.github_repo}` can impersonate the SA.

- [ ] **Step 2: Local apply.**
      ```sh
      cd infra/bootstrap
      cp terraform.tfvars.example terraform.tfvars   # fill in project_id, github_repo
      terraform init
      terraform apply
      terraform output -json > bootstrap-outputs.json
      ```

- [ ] **Step 3: Add `bootstrap-outputs.json` to `.gitignore` and commit the module.**

**Acceptance:** `terraform apply` succeeds; `bootstrap-outputs.json` contains `state_bucket`, `workload_identity_provider`, `ci_service_account_email`.

---

## Task 2: GitHub repo secrets

Manual.

- [ ] **Step 1: In GitHub repo Settings → Secrets and variables → Actions, add:**
  - `GCP_PROJECT_ID` — the project ID.
  - `GCP_WIF_PROVIDER` — value of `workload_identity_provider`.
  - `GCP_CI_SA_EMAIL` — value of `ci_service_account_email`.
  - `MAPTILER_KEY` — the MapTiler API key (used at FE build time; also stored in Secret Manager).

**Acceptance:** The four secrets appear in repo settings.

---

## Task 3: Main Terraform — providers, backend, APIs, variables

**Files:**
- Create: `infra/main/providers.tf`, `backend.tf`, `apis.tf`, `variables.tf`

- [ ] **Step 1:** `providers.tf` declares `google` + `google-beta` (region/project from variables).
- [ ] **Step 2:** `backend.tf` configures `backend "gcs"` with the bootstrap-created bucket name and prefix `main/`.
- [ ] **Step 3:** `apis.tf` enables `run.googleapis.com`, `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`, `storage.googleapis.com`, `iam.googleapis.com`, `logging.googleapis.com`.
- [ ] **Step 4:** `variables.tf` declares `project_id`, `region` (default `europe-north1`), `image_backend`, `image_frontend`, `cors_origins` (default `""`).
- [ ] **Step 5:** `terraform init -backend-config=...` and `terraform validate`.

**Acceptance:** `terraform validate` passes; remote state file appears in the bootstrap bucket.

---

## Task 4: Main Terraform — Artifact Registry, GCS replica, Secret Manager

**Files:**
- Create: `infra/main/artifact_registry.tf`, `storage.tf`, `secrets.tf`

- [ ] **Step 1:** AR repo `meteo-map-lab`, format `DOCKER`, location = `var.region`.
- [ ] **Step 2:** GCS bucket `${var.project_id}-litestream`, uniform access, versioning on, lifecycle: transition to `COLDLINE` after 30d, delete noncurrent after 90d.
- [ ] **Step 3:** Secret `maptiler-key` (no value yet — value is added manually in Task 5 or via `gcloud secrets versions add`).

**Acceptance:** `terraform apply` creates all three; `gcloud artifacts repositories list --location=europe-north1` shows `meteo-map-lab`.

---

## Task 5: Main Terraform — runtime IAM

**Files:**
- Create: `infra/main/iam.tf`

- [ ] **Step 1:** SA `meteo-map-lab-backend@…` for the backend runtime; grant `roles/storage.objectAdmin` **scoped to** the litestream bucket (via `google_storage_bucket_iam_member`, not project-wide).
- [ ] **Step 2:** SA `meteo-map-lab-frontend@…` for the frontend runtime; no extra roles.
- [ ] **Step 3:** Grant the CI service account `roles/secretmanager.secretAccessor` on the `maptiler-key` secret (so the deploy workflow can pull it during the FE build).
- [ ] **Step 4:** Add the MapTiler key value:
      `printf '%s' "$MAPTILER_KEY" | gcloud secrets versions add maptiler-key --data-file=-`.

**Acceptance:** `gcloud secrets versions access latest --secret=maptiler-key` returns the key when authenticated as the CI SA (test by impersonation).

---

## Task 6: Main Terraform — backend Cloud Run service

**Files:**
- Create: `infra/main/cloud_run_backend.tf`, `outputs.tf` (initial)

- [ ] **Step 1:** `google_cloud_run_v2_service` `backend`, `template.scaling { min_instance_count = 1, max_instance_count = 1 }`, `execution_environment = "EXECUTION_ENVIRONMENT_GEN2"`, container image = `var.image_backend` (default placeholder `gcr.io/cloudrun/hello`), service_account = backend SA.
- [ ] **Step 2:** Container: `resources { limits = { cpu = "250m", memory = "512Mi" } }`, port 8000, env: `DATABASE_URL=sqlite:////data/meteo_map_lab.db`, `CORS_ORIGINS=${var.cors_origins}`, `LITESTREAM_BUCKET=${google_storage_bucket.litestream.name}`, `LITESTREAM_PATH=meteo_map_lab`.
- [ ] **Step 3:** Add `volumes { name = "data" empty_dir { medium = "MEMORY" size_limit = "512Mi" } }` and `volume_mounts { name = "data" mount_path = "/data" }`.
- [ ] **Step 4:** `google_cloud_run_v2_service_iam_member` granting `allUsers` `roles/run.invoker`.
- [ ] **Step 5:** Output `backend_url = google_cloud_run_v2_service.backend.uri`.

**Acceptance:** `terraform apply` succeeds with the placeholder image; `curl ${backend_url}` returns a Cloud Run hello.

---

## Task 7: Main Terraform — frontend Cloud Run service

**Files:**
- Create: `infra/main/cloud_run_frontend.tf`; append to `outputs.tf`

- [ ] **Step 1:** `google_cloud_run_v2_service` `frontend`, `min_instance_count = 0`, `max_instance_count = 4`, container image = `var.image_frontend` (default placeholder), service_account = frontend SA, port 8080, CPU 250m / 256Mi.
- [ ] **Step 2:** Public invoker binding.
- [ ] **Step 3:** Output `frontend_url`.

**Acceptance:** `terraform apply` succeeds with placeholder image.

---

## Task 8: Backend production image

**Files:**
- Create: `backend/Dockerfile.prod`, `backend/entrypoint.sh`, `backend/litestream.yml`

- [ ] **Step 1:** Author `Dockerfile.prod` per spec §5.1.
- [ ] **Step 2:** Author `entrypoint.sh` per spec §5.2 (chmod +x in Dockerfile).
- [ ] **Step 3:** Author `litestream.yml` per spec §5.3.
- [ ] **Step 4:** Local sanity check:
      ```sh
      docker build -t meteo-map-lab-backend:test -f backend/Dockerfile.prod .
      docker run --rm -e LITESTREAM_BUCKET=does-not-matter -p 8000:8000 meteo-map-lab-backend:test
      curl -fsS http://localhost:8000/health
      ```
      Expect: `litestream restore -if-replica-exists` no-ops (replica doesn't exist), uvicorn starts, `/health` returns 200. Replication will fail without GCS creds — that's expected locally; the process keeps running.

**Acceptance:** Local container starts, `/health` returns 200.

---

## Task 9: Backend app config — env-overridable

**Files:**
- Modify: `backend/app/core/config.py`, `backend/app/main.py` (CORS wiring)

- [ ] **Step 1:** Confirm `Settings` reads `DATABASE_URL` and `CORS_ORIGINS` from env (pydantic-settings auto-maps `cors_origins` ↔ `CORS_ORIGINS`).
- [ ] **Step 2:** If `cors_origins` is currently a single string, ensure `CORSMiddleware` is built with `allow_origins=[settings.cors_origins]` (or comma-split if you support multiple).
- [ ] **Step 3:** Add a test `tests/test_cors.py` that boots the app with `CORS_ORIGINS=https://example.com` env and asserts `Access-Control-Allow-Origin` echoes the configured origin.

**Acceptance:** `make test` still green; new CORS test passes.

---

## Task 10: Frontend production image

**Files:**
- Create: `frontend/Dockerfile.prod`, `frontend/nginx.conf`

- [ ] **Step 1:** Author both files per spec §6.1 and §6.2.
- [ ] **Step 2:** Local sanity check with placeholders:
      ```sh
      docker build -t meteo-map-lab-frontend:test \
        --build-arg VITE_API_URL=http://localhost:8000 \
        --build-arg VITE_MAPTILER_KEY=$VITE_MAPTILER_KEY \
        -f frontend/Dockerfile.prod .
      docker run --rm -p 8080:8080 meteo-map-lab-frontend:test
      open http://localhost:8080
      ```
      Expect: the SPA loads, hits the backend at `http://localhost:8000` (if `make up` is also running), and renders.

**Acceptance:** Local container serves the SPA on 8080.

---

## Task 11: CI workflow — PR (test + plan)

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1:** Job `backend`: checkout, `astral-sh/setup-uv@v3`, `uv sync` and `uv run pytest` in `backend/`.
- [ ] **Step 2:** Job `frontend`: checkout, `actions/setup-node@v4` with `node-version-file: '.nvmrc'`, `npm ci`, `npm run typecheck`, `npm run lint` in `frontend/`.
- [ ] **Step 3:** Job `terraform-plan`: `permissions: { id-token: write, contents: read }`, `google-github-actions/auth@v2` via WIF, `hashicorp/setup-terraform@v3`, `terraform init && terraform plan -no-color` in `infra/main/`. Post the plan as a sticky PR comment (e.g. `marocchino/sticky-pull-request-comment`).
- [ ] **Step 4:** Open a PR with a noop change to verify the workflow triggers and all three jobs succeed.

**Acceptance:** PR shows green checks for `backend`, `frontend`, `terraform-plan`, with the plan as a PR comment.

---

## Task 12: CI workflow — main deploy

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1:** Trigger on `push: { branches: [main] }`. One `deploy` job with `permissions: { id-token: write, contents: read }`.
- [ ] **Step 2:** Steps in order: checkout → `google-github-actions/auth@v2` via WIF → `setup-gcloud@v2` → `gcloud auth configure-docker europe-north1-docker.pkg.dev`.
- [ ] **Step 3:** **TF apply pass A** in `infra/main/`: `terraform init && terraform apply -auto-approve` (creates/updates everything; backend may still point at the previous image — that's fine).
- [ ] **Step 4:** Build/push backend image tagged `:${{ github.sha }}` to AR; `gcloud run deploy meteo-map-lab-backend --image=...:$SHA --region=europe-north1 --quiet`.
- [ ] **Step 5:** `BE_URL=$(gcloud run services describe meteo-map-lab-backend --region=europe-north1 --format='value(uri)')`; export as job output.
- [ ] **Step 6:** Pull MapTiler key: `MAPTILER=$(gcloud secrets versions access latest --secret=maptiler-key)`.
- [ ] **Step 7:** Build/push frontend image with `--build-arg VITE_API_URL=$BE_URL --build-arg VITE_MAPTILER_KEY=$MAPTILER`; `gcloud run deploy meteo-map-lab-frontend --image=...:$SHA --region=europe-north1 --quiet`.
- [ ] **Step 8:** `FE_URL=$(gcloud run services describe meteo-map-lab-frontend ...)`; **TF apply pass B**: `terraform apply -auto-approve -var=cors_origins=$FE_URL -var=image_backend=...:$SHA -var=image_frontend=...:$SHA` (reconciles BE env vars + image refs into state).

**Acceptance:** Pushing a commit to `main` runs the workflow to completion; both Cloud Run revisions roll out; logs show Litestream connecting to the bucket.

---

## Task 13: First end-to-end deploy

- [ ] **Step 1:** Create a `feat/gcp-deploy` branch with everything from Tasks 1–12.
- [ ] **Step 2:** Open PR → confirm `test.yml` green and the plan comment looks sane.
- [ ] **Step 3:** Merge to `main` → watch `deploy.yml`.
- [ ] **Step 4:** Visit the frontend URL; click a coordinate on the map; verify the chart renders (this exercises FE → BE round-trip, Cloud Run → GCS replica writes).
- [ ] **Step 5:** Force a redeploy (push an empty commit) and verify the second run reads from the previously written Litestream replica (logs show `litestream restore` succeeding).

**Acceptance:** Live URL serves meteo-map-lab; data persists across redeploys.

---

## Task 14: Smoke checks & documentation

**Files:**
- Modify: `README.md`, `ai-docs/PLANNING.md`

- [ ] **Step 1:** Add a `## Deploy` section to `README.md` pointing at the spec, listing the four GitHub secrets, and noting that the deploy is triggered by merging to `main`.
- [ ] **Step 2:** Flip the PLANNING.md deployment milestone from 🟡 to ✅; link both the spec and this plan.
- [ ] **Step 3:** (Optional) Add an `uptime_check` and a `monthly budget` resource to Terraform for €10/mo alert. Out of scope per spec §1; add only if quick.

**Acceptance:** README has a `Deploy` section; PLANNING.md milestone is ✅.

---

## Out of scope (do not implement in this plan)

- Custom domain / TLS via Cloud Run domain mappings (separate small follow-up).
- Staging environment / second GCP project.
- Migrating off SQLite to Cloud SQL (separate spec needed; the repository abstraction makes it tractable).
- Cloud Monitoring dashboards beyond a single budget alert.
- Restore-verification cron job.

## Risks during implementation

- **WIF attribute conditions are easy to misspell.** If the deploy workflow fails with `Permission 'iam.serviceAccounts.getAccessToken' denied`, double-check `attribute.repository` matches `github_repo` exactly.
- **The first `terraform apply` of `cloud_run_backend.tf` will fail if the image variable points at a tag that doesn't exist yet.** Use the placeholder `gcr.io/cloudrun/hello` as the default and override via `-var=image_backend=...` once the AR image exists. The deploy workflow handles this via pass A → image build → pass B.
- **`min_instances=1` starts billing immediately on `apply`** even if no traffic flows. Expected — call it out in the README so it doesn't surprise on the first bill.
- **The MapTiler key is baked into the FE bundle** — it's a public key (already exposed via `VITE_` prefix) but make sure no other secrets leak into `VITE_` envs by accident.

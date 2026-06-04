// Runtime service accounts (one per Cloud Run service) and the bindings they
// need. The CI service account itself is created in `infra/bootstrap/`; we
// look it up here via data source and grant it secret-read access to the
// MapTiler key so the deploy workflow can bake it into the frontend image.

data "google_service_account" "ci" {
  account_id = "tf-deployer"
}

// ---- Backend runtime --------------------------------------------------------
//
// This SA runs the FastAPI + Litestream container. Its only privilege is
// read/write on the Litestream replica bucket — narrow on purpose so a
// compromised container can't reach the rest of the project.

resource "google_service_account" "backend" {
  account_id   = "meteo-map-lab-backend"
  display_name = "meteo-map-lab backend runtime"
  description  = "Identity of the backend Cloud Run service; writes Litestream replicas."
}

resource "google_storage_bucket_iam_member" "backend_litestream" {
  bucket = google_storage_bucket.litestream.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.backend.email}"
}

// ---- Frontend runtime -------------------------------------------------------
//
// Static nginx image — no project access needed.

resource "google_service_account" "frontend" {
  account_id   = "meteo-map-lab-frontend"
  display_name = "meteo-map-lab frontend runtime"
  description  = "Identity of the frontend Cloud Run service; serves static assets only."
}

// ---- CI access to the MapTiler secret --------------------------------------
//
// The deploy workflow pulls this secret in the frontend-build step and bakes
// it into the Vite bundle as VITE_MAPTILER_KEY. Scoped to the single secret;
// no project-wide secretmanager access for the CI SA.

resource "google_secret_manager_secret_iam_member" "ci_maptiler_reader" {
  secret_id = google_secret_manager_secret.maptiler_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_service_account.ci.email}"
}

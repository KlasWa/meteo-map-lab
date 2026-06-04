// Single Docker repo holding both the backend and frontend images. Image
// paths are:
//   europe-north1-docker.pkg.dev/meteo-map-lab/meteo-map-lab/backend:SHA
//   europe-north1-docker.pkg.dev/meteo-map-lab/meteo-map-lab/frontend:SHA

resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = "meteo-map-lab"
  description   = "Container images for meteo-map-lab Cloud Run services."
  format        = "DOCKER"

  depends_on = [google_project_service.main]
}

output "backend_url" {
  description = "Public URL of the backend Cloud Run service."
  value       = google_cloud_run_v2_service.backend.uri
}

output "frontend_url" {
  description = "Public URL of the frontend Cloud Run service."
  value       = google_cloud_run_v2_service.frontend.uri
}

output "litestream_bucket" {
  description = "GCS bucket holding the SQLite replica."
  value       = google_storage_bucket.litestream.name
}

output "artifact_registry_repo" {
  description = "Artifact Registry repo path for tagging container images."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.main.repository_id}"
}

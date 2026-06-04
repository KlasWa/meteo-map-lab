// Frontend Cloud Run service. Static nginx image serving the Vite build.
// Stateless — scales to zero, can run multiple instances, no volumes or
// always-on cost. The MapTiler key is baked into the build at CI time, so
// the runtime SA needs no Secret Manager access.

resource "google_cloud_run_v2_service" "frontend" {
  name     = "meteo-map-lab-frontend"
  location = var.region

  template {
    service_account       = google_service_account.frontend.email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    scaling {
      min_instance_count = 0
      max_instance_count = 4
    }

    containers {
      image = var.image_frontend

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        // Throttled CPU between requests; min=0 means no idle cost either.
        // Gen2 minimums are 1 vCPU and 512 MiB regardless of actual nginx
        // needs (it'd be happy with ~64 MiB).
        cpu_idle = true
      }
    }
  }

  // Image is owned by the deploy workflow (`gcloud run deploy …:SHA`); see
  // the matching comment in cloud_run_backend.tf.
  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [google_project_service.main]
}

resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  project  = google_cloud_run_v2_service.frontend.project
  location = google_cloud_run_v2_service.frontend.location
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

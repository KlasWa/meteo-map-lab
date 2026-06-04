// Backend Cloud Run service. Pinned to a single always-on instance because
// SQLite + Litestream needs a single writer; horizontal scaling would
// corrupt the WAL. The cost of `min=1` (~€5–7/mo) is the price of keeping
// SQLite in production. See deploy spec §5 for the reasoning.
//
// On the very first apply, `var.image_backend` is the public
// `gcr.io/cloudrun/hello` placeholder — Litestream isn't in that image so
// the service will just serve hello text. The deploy workflow swaps it for
// the real image as soon as backend/Dockerfile.prod is built and pushed.

resource "google_cloud_run_v2_service" "backend" {
  name     = "meteo-map-lab-backend"
  location = var.region

  template {
    service_account       = google_service_account.backend.email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }

    containers {
      image = var.image_backend

      ports {
        container_port = 8000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        // Request-based CPU. Cloud Run gen2's minimum is 1 vCPU; fractional
        // vCPU is gen1-only and gen1 doesn't support volume mounts (we need
        // tmpfs at /data for SQLite). With cpu_idle=true the CPU throttles
        // between requests so the ongoing cost is ~€9-12/mo for the always-
        // warm instance instead of ~€25 for always-allocated.
        cpu_idle = true
      }

      env {
        name  = "DATABASE_URL"
        value = "sqlite:////data/meteo_map_lab.db"
      }
      env {
        name  = "CORS_ORIGINS"
        value = var.cors_origins
      }
      env {
        name  = "LITESTREAM_BUCKET"
        value = google_storage_bucket.litestream.name
      }
      env {
        name  = "LITESTREAM_PATH"
        value = "meteo_map_lab"
      }

      volume_mounts {
        name       = "data"
        mount_path = "/data"
      }
    }

    // Ephemeral in-memory volume for the SQLite file. Litestream restores
    // from GCS on container start and streams the WAL out continuously while
    // running. tmpfs counts against the container's memory limit.
    volumes {
      name = "data"
      empty_dir {
        medium     = "MEMORY"
        size_limit = "512Mi"
      }
    }
  }

  // Image is owned by the deploy workflow (`gcloud run deploy …:SHA`), not
  // by Terraform. Without this, every PR plan after a deploy would show a
  // spurious diff between the var default (cloudrun/hello) and whatever
  // SHA is live in production.
  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [google_project_service.main]
}

// Public ingress. `allUsers` is the standard way to make a Cloud Run service
// reachable from the internet without auth.
resource "google_cloud_run_v2_service_iam_member" "backend_public" {
  project  = google_cloud_run_v2_service.backend.project
  location = google_cloud_run_v2_service.backend.location
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

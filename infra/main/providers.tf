// `infra/main/` is the project's runtime infrastructure: APIs, Artifact
// Registry, GCS Litestream bucket, Secret Manager, IAM, and the two Cloud Run
// services. It runs from GitHub Actions (authenticated via the WIF pool that
// `infra/bootstrap/` created). It can also be applied locally by anyone with
// owner-equivalent access on the project — handy for the first bring-up.

terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.10"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.10"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

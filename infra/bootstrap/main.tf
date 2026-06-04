// One-time bootstrap for the meteo-map-lab GCP deployment. This module is applied
// LOCALLY by a human with `gcloud auth application-default login` because it
// creates the very things CI uses to authenticate (the Terraform state bucket
// and the Workload Identity Federation pool). Everything else lives in
// `../main/` and is applied from GitHub Actions.
//
// Re-applying is safe and idempotent.

terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.10"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

// --- APIs we need to call from this module ---------------------------------
// `serviceusage` itself must already be enabled on the project (it is by
// default on new projects). If a fresh apply fails complaining about
// serviceusage, run once manually:
//   gcloud services enable serviceusage.googleapis.com \
//     cloudresourcemanager.googleapis.com --project=$PROJECT_ID

locals {
  bootstrap_apis = [
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com",
  ]
}

resource "google_project_service" "bootstrap" {
  for_each           = toset(local.bootstrap_apis)
  service            = each.value
  disable_on_destroy = false
}

// --- Terraform state bucket ------------------------------------------------

resource "google_storage_bucket" "tfstate" {
  name                        = "${var.project_id}-tfstate"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 5
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.bootstrap]
}

// --- Workload Identity Federation for GitHub Actions -----------------------

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  description               = "Federated identity for the meteo-map-lab CI workflows."

  depends_on = [google_project_service.bootstrap]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions OIDC"

  // Restrict the provider to tokens from THIS repository. Tokens from any other
  // repo are rejected at the federation layer, before any role binding is
  // consulted.
  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

// --- CI service account ----------------------------------------------------
// All CI work runs as this SA. It has the union of roles the `infra/main/`
// module needs to create/update resources. It is NOT a runtime SA; runtime
// SAs (for Cloud Run services) are created in `infra/main/`.

resource "google_service_account" "tf_deployer" {
  account_id   = "tf-deployer"
  display_name = "Terraform deployer (CI)"
  description  = "Used by GitHub Actions via WIF to apply infra/main."
}

locals {
  tf_deployer_roles = [
    "roles/run.admin",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.serviceAccountUser", // needed to attach runtime SAs to Cloud Run
    "roles/secretmanager.admin",
    "roles/storage.admin",
    "roles/artifactregistry.admin",
    "roles/serviceusage.serviceUsageAdmin",
    "roles/iam.workloadIdentityPoolAdmin",
  ]
}

resource "google_project_iam_member" "tf_deployer" {
  for_each = toset(local.tf_deployer_roles)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.tf_deployer.email}"
}

// Allow any workflow on this repo (any branch / any event) to impersonate the
// CI SA via WIF. The `attribute_condition` on the provider above already
// restricts the repo, so this binding only needs to scope the impersonation.
resource "google_service_account_iam_member" "tf_deployer_wif" {
  service_account_id = google_service_account.tf_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

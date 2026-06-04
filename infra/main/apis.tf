// APIs that the runtime infra depends on. `storage`, `iam`, `iamcredentials`,
// `sts`, `serviceusage`, and `cloudresourcemanager` are already on from
// `infra/bootstrap/` — re-enabling them here would create a dual-management
// situation, so we don't.

locals {
  main_apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "logging.googleapis.com",
  ]
}

resource "google_project_service" "main" {
  for_each           = toset(local.main_apis)
  service            = each.value
  disable_on_destroy = false
}

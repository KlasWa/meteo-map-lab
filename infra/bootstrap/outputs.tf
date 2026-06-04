output "state_bucket" {
  description = "GCS bucket for the Terraform state of infra/main."
  value       = google_storage_bucket.tfstate.name
}

output "workload_identity_provider" {
  description = "Full resource name of the WIF provider. Set this as the GCP_WIF_PROVIDER GitHub secret."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "ci_service_account_email" {
  description = "Email of the CI service account. Set this as the GCP_CI_SA_EMAIL GitHub secret."
  value       = google_service_account.tf_deployer.email
}

output "github_secrets_summary" {
  description = "Human-friendly summary of the four GitHub repo secrets to set."
  value = {
    GCP_PROJECT_ID   = var.project_id
    GCP_WIF_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_CI_SA_EMAIL  = google_service_account.tf_deployer.email
    MAPTILER_KEY     = "<paste your MapTiler API key here>"
  }
}

// Remote state in the GCS bucket created by `infra/bootstrap/`. Hardcoded
// because Terraform backend blocks don't accept variables (they're consulted
// before variables exist). If you stand up a second project, copy this file
// and change the bucket name.

terraform {
  backend "gcs" {
    bucket = "meteo-map-lab-tfstate"
    prefix = "main/"
  }
}

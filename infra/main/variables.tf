variable "project_id" {
  type        = string
  description = "GCP project ID (e.g. 'meteo-map-lab')."
}

variable "region" {
  type        = string
  description = "Region for Artifact Registry, GCS buckets, and Cloud Run services."
  default     = "europe-north1"
}

variable "image_backend" {
  type        = string
  description = "Container image tag for the backend Cloud Run service. The default is the public 'cloudrun/hello' placeholder; CI overrides this with the real image:sha on every deploy."
  default     = "gcr.io/cloudrun/hello"
}

variable "image_frontend" {
  type        = string
  description = "Container image tag for the frontend Cloud Run service. Same placeholder convention as image_backend."
  default     = "gcr.io/cloudrun/hello"
}

variable "cors_origins" {
  type        = string
  description = "Value of the backend's CORS_ORIGINS env var. Empty on first apply (frontend URL unknown); the second pass in the CI deploy fills it with the frontend Cloud Run URL."
  default     = ""
}

variable "project_id" {
  type        = string
  description = "The GCP project ID hosting meteo-map-lab (e.g. 'meteo-map-lab-prod')."
}

variable "region" {
  type        = string
  description = "Default region for state bucket and runtime services."
  default     = "europe-north1"
}

variable "github_repo" {
  type        = string
  description = "GitHub repo in 'OWNER/NAME' form (e.g. 'KlasWa/meteo-map-lab'). Tokens from any other repo are rejected by the WIF provider's attribute_condition."
}

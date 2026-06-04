// Secret resources only — no versions. The MapTiler key value is added
// out-of-band after the first apply via:
//   gcloud secrets versions add maptiler-key --data-file=- < <(printf '%s' "$KEY")
// (See Task 5 in the deploy plan.)
//
// The IAM bindings that let the CI service account (for FE builds) and the
// FE runtime read this secret live in iam.tf — they reference this resource.

resource "google_secret_manager_secret" "maptiler_key" {
  secret_id = "maptiler-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.main]
}

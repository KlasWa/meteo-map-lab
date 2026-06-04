// Litestream's replica target. Litestream writes a snapshot every 24h and
// streams the SQLite WAL with 1s sync; old generations become archived as
// fresh ones land. Versioning is on so we can recover from a bad replication
// state; the lifecycle rules below keep the bucket from growing forever.
//
// `force_destroy = false` so a runaway `terraform destroy` can't wipe the
// SQLite history while objects still exist — manual cleanup is required.

resource "google_storage_bucket" "litestream" {
  name                        = "${var.project_id}-litestream"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = true
  }

  // Tier old (archived) generations to Coldline after 30 days.
  lifecycle_rule {
    condition {
      age        = 30
      with_state = "ARCHIVED"
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  // Delete archived generations after 90 days. Litestream's own retention
  // (configured in litestream.yml) handles ongoing pruning of live objects;
  // this is a safety net for orphaned versions.
  lifecycle_rule {
    condition {
      age        = 90
      with_state = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }
}

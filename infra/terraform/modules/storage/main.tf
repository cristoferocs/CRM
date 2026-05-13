# =============================================================================
# CLOUD STORAGE — Bucket de mídia
# Sempre criado em todos os tiers.
# =============================================================================

resource "google_storage_bucket" "media" {
  name          = "${var.client_slug}-media"
  location      = var.region
  force_destroy = false

  # Controle de acesso uniforme (bloqueia ACLs por objeto individual)
  uniform_bucket_level_access = true

  # Versionamento desabilitado por padrão (objetos de mídia são substituídos)
  versioning {
    enabled = false
  }

  cors {
    origin          = ["https://${var.domain}"]
    method          = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    response_header = ["Content-Type", "Content-Length", "Authorization"]
    max_age_seconds = 3600
  }

  # Mover objetos antigos para Nearline (leitura esporádica, menor custo)
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  # Mover objetos muito antigos para Coldline
  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }
}

# A service account do Cloud Run tem acesso total ao bucket de mídia
resource "google_storage_bucket_iam_member" "cloud_run_object_admin" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.cloud_run_sa_email}"
}

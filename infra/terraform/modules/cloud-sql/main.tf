# =============================================================================
# CLOUD SQL — PostgreSQL 15
# Criado apenas nos tiers growth e enterprise (via count no main.tf raiz).
# =============================================================================

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "main" {
  name             = "${var.client_slug}-pg15"
  database_version = "POSTGRES_15"
  region           = var.region

  # IMPORTANTE: proteção contra destruição acidental
  deletion_protection = true

  settings {
    tier              = var.db_sql_tier
    availability_type = var.enable_ha ? "REGIONAL" : "ZONAL"
    disk_autoresize   = true
    disk_size         = 20

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00" # 03h UTC (00h BRT)
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
      # Point-in-time recovery habilitado apenas no tier enterprise (enable_ha=true)
      point_in_time_recovery_enabled = var.enable_ha
    }

    ip_configuration {
      ipv4_enabled    = false # sem IP público — só acesso via VPC privada
      private_network = var.vpc_id

      # Aceita conexões apenas pela VPC (sem authorized networks externas)
      require_ssl = true
    }

    maintenance_window {
      day          = 7 # Domingo
      hour         = 4 # 04h UTC (01h BRT)
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false
    }

    database_flags {
      name  = "max_connections"
      value = var.enable_ha ? "200" : "100"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_sql_database" "crm" {
  name     = var.client_slug
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "crm_user" {
  name     = "crm_user"
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

# =============================================================================
# SECRET MANAGER — salva a DATABASE_URL para uso pelo Cloud Run
# =============================================================================

resource "google_secret_manager_secret_version" "database_url" {
  secret = var.secret_id
  secret_data = jsonencode(
    "postgresql://crm_user:${random_password.db_password.result}@/${var.client_slug}?host=/cloudsql/${google_sql_database_instance.main.connection_name}&sslmode=require"
  )
}

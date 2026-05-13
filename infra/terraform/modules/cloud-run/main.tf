# =============================================================================
# CLOUD RUN — API
# =============================================================================

resource "google_cloud_run_v2_service" "api" {
  name     = "${var.client_slug}-api"
  location = var.region

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    # Cloud SQL proxy — só configurado quando connection_name está preenchido
    dynamic "volumes" {
      for_each = var.cloudsql_connection_name != "" ? [1] : []
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.cloudsql_connection_name]
        }
      }
    }

    containers {
      image = "${var.artifact_registry_url}/crm-api:latest"

      resources {
        limits = {
          memory = var.memory
          cpu    = var.cpu
        }
        # CPU alocada apenas durante o processamento (economiza nos tiers starter/growth)
        cpu_idle = var.min_instances == 0 ? true : false
      }

      # Env vars não-sensíveis
      env {
        name  = "NODE_ENV"
        value = var.environment == "production" ? "production" : "development"
      }
      env {
        name  = "PORT"
        value = "3333"
      }
      env {
        name  = "APP_URL"
        value = var.app_url
      }

      # Env vars sensíveis via Secret Manager — nunca valores diretos
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = var.secret_database_url_id
            version = "latest"
          }
        }
      }

      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = var.secret_redis_url_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = var.secret_jwt_id
            version = "latest"
          }
        }
      }

      env {
        name = "FIREBASE_SERVICE_ACCOUNT"
        value_source {
          secret_key_ref {
            secret  = var.secret_firebase_sa_id
            version = "latest"
          }
        }
      }

      # Volume mount do Cloud SQL proxy (quando aplicável)
      dynamic "volume_mounts" {
        for_each = var.cloudsql_connection_name != "" ? [1] : []
        content {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }

      ports {
        container_port = 3333
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 3333
        }
        initial_delay_seconds = 5
        timeout_seconds       = 3
        period_seconds        = 5
        failure_threshold     = 10
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 3333
        }
        initial_delay_seconds = 30
        timeout_seconds       = 5
        period_seconds        = 30
        failure_threshold     = 3
      }
    }
  }

  lifecycle {
    ignore_changes = [
      # Permite atualizações de imagem fora do Terraform (pelo deploy.sh)
      template[0].containers[0].image,
    ]
  }
}

# =============================================================================
# CLOUD RUN — WORKER (filas BullMQ)
# =============================================================================

resource "google_cloud_run_v2_service" "worker" {
  name     = "${var.client_slug}-worker"
  location = var.region

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    dynamic "volumes" {
      for_each = var.cloudsql_connection_name != "" ? [1] : []
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.cloudsql_connection_name]
        }
      }
    }

    containers {
      image = "${var.artifact_registry_url}/crm-worker:latest"

      resources {
        limits = {
          memory = var.memory
          cpu    = var.cpu
        }
        cpu_idle = true
      }

      env {
        name  = "NODE_ENV"
        value = var.environment == "production" ? "production" : "development"
      }
      env {
        name  = "APP_URL"
        value = var.app_url
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = var.secret_database_url_id
            version = "latest"
          }
        }
      }

      env {
        name = "REDIS_URL"
        value_source {
          secret_key_ref {
            secret  = var.secret_redis_url_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = var.secret_jwt_id
            version = "latest"
          }
        }
      }

      env {
        name = "FIREBASE_SERVICE_ACCOUNT"
        value_source {
          secret_key_ref {
            secret  = var.secret_firebase_sa_id
            version = "latest"
          }
        }
      }

      dynamic "volume_mounts" {
        for_each = var.cloudsql_connection_name != "" ? [1] : []
        content {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }

      ports {
        container_port = 3333
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 3333
        }
        initial_delay_seconds = 30
        timeout_seconds       = 5
        period_seconds        = 60
        failure_threshold     = 3
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# =============================================================================
# IAM — permite que o serviço worker seja invocado internamente pela API
# O acesso público é bloqueado (sem allUsers)
# =============================================================================

resource "google_cloud_run_v2_service_iam_member" "worker_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.worker.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.service_account_email}"
}

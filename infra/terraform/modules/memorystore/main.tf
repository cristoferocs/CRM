# =============================================================================
# MEMORYSTORE REDIS 7 — Alta Disponibilidade
# Criado apenas no tier enterprise (via count no main.tf raiz).
# =============================================================================

resource "google_redis_instance" "main" {
  name           = "${var.client_slug}-redis"
  display_name   = "CRM Redis — ${var.client_slug}"
  tier           = "STANDARD_HA" # réplica automática para HA
  memory_size_gb = var.redis_memory_gb
  region         = var.region

  redis_version = "REDIS_7_0"

  # Acesso apenas dentro da VPC privada
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  authorized_network = var.vpc_id

  redis_configs = {
    # Evita perda de dados em caso de reinício — importante em produção
    "maxmemory-policy" = "allkeys-lru"
    "notify-keyspace-events" = ""
  }

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 3
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

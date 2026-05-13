# =============================================================================
# VARIÁVEIS BASE
# =============================================================================

variable "project_id" {
  description = "ID do projeto GCP"
  type        = string
}

variable "region" {
  description = "Região GCP padrão"
  type        = string
  default     = "southamerica-east1"
}

variable "client_name" {
  description = "Nome legível do cliente (ex: Agência XYZ)"
  type        = string
}

variable "client_slug" {
  description = "Slug único do cliente para nomear recursos (ex: agencia-xyz)"
  type        = string
}

variable "environment" {
  description = "Ambiente de deploy"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment deve ser: dev, staging ou production."
  }
}

variable "app_url" {
  description = "URL pública da aplicação (ex: https://crm.agenciaxyz.com.br)"
  type        = string
}

variable "domain" {
  description = "Domínio da aplicação sem protocolo (ex: crm.agenciaxyz.com.br)"
  type        = string
}

# =============================================================================
# VARIÁVEL DE TIER — a única mudança necessária para escalar a infraestrutura
# =============================================================================

variable "tier" {
  description = <<-EOT
    Tier de infraestrutura:
      starter    — Neon DB + Upstash Redis (zero infra GCP, custo mínimo)
      growth     — Cloud SQL + Upstash Redis (banco gerenciado no GCP)
      enterprise — Cloud SQL HA + Memorystore HA (full GCP, alta disponibilidade)
  EOT
  type        = string
  default     = "starter"
  validation {
    condition     = contains(["starter", "growth", "enterprise"], var.tier)
    error_message = "tier deve ser: starter, growth ou enterprise."
  }
}

# =============================================================================
# SERVIÇOS EXTERNOS (usados no tier starter e growth para Redis)
# =============================================================================

variable "neon_db_url" {
  description = "Connection string do Neon DB (usado apenas no tier starter)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "upstash_redis_url" {
  description = "URL do Upstash Redis (usado nos tiers starter e growth)"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# LOCALS — configuração resolvida por tier
# Alterar apenas var.tier no .tfvars já altera toda a infraestrutura abaixo.
# =============================================================================

locals {
  config = {
    starter = {
      db_type            = "external"   # Neon DB (fora do GCP)
      redis_type         = "external"   # Upstash (fora do GCP)
      db_sql_tier        = ""           # não usado
      redis_memory_gb    = 0            # não usado
      run_min_instances  = 0            # escala a zero para economizar
      run_max_instances  = 2
      run_memory         = "256Mi"
      run_cpu            = "1"
      create_cloud_sql   = false
      create_memorystore = false
      create_vpc         = false
      enable_ha          = false
      enable_cdn         = false
      enable_armor       = false
    }
    growth = {
      db_type            = "cloud_sql"
      db_sql_tier        = "db-g1-small" # 1 vCPU compartilhada, 1.7 GB RAM
      redis_type         = "external"    # Upstash ainda (mais barato que Memorystore)
      redis_memory_gb    = 0             # não usado
      run_min_instances  = 1
      run_max_instances  = 10
      run_memory         = "512Mi"
      run_cpu            = "1"
      create_cloud_sql   = true
      create_memorystore = false
      create_vpc         = true
      enable_ha          = false
      enable_cdn         = false
      enable_armor       = false
    }
    enterprise = {
      db_type            = "cloud_sql"
      db_sql_tier        = "db-n1-standard-2" # 2 vCPU, 7.5 GB RAM
      redis_type         = "memorystore"
      redis_memory_gb    = 2
      run_min_instances  = 2
      run_max_instances  = 50
      run_memory         = "1Gi"
      run_cpu            = "2"
      create_cloud_sql   = true
      create_memorystore = true
      create_vpc         = true
      enable_ha          = true
      enable_cdn         = true
      enable_armor       = true
    }
  }

  # Configuração ativa — referenciada em todos os módulos como local.cfg.*
  cfg = local.config[var.tier]

  # Artifact Registry URL construída a partir do projeto e região
  artifact_registry_url = "${var.region}-docker.pkg.dev/${var.project_id}/crm"

  # DATABASE_URL resolvida por tier (passada ao Cloud Run)
  database_url = local.cfg.db_type == "cloud_sql" ? (
    "postgresql://crm_user:$(SECRET:db_password)@/${var.client_slug}?host=/cloudsql/${length(module.cloud_sql) > 0 ? module.cloud_sql[0].connection_name : ""}"
  ) : var.neon_db_url

  # REDIS_URL resolvida por tier (passada ao Cloud Run)
  redis_url = local.cfg.redis_type == "memorystore" ? (
    "redis://${length(module.memorystore) > 0 ? module.memorystore[0].host : ""}:6379"
  ) : var.upstash_redis_url
}

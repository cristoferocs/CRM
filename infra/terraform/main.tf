# =============================================================================
# PROVIDERS
# =============================================================================

terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }

  # Backend GCS para state remoto por cliente
  # O bucket é criado automaticamente pelo script new-client.sh
  backend "gcs" {
    bucket = "${var.client_slug}-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# =============================================================================
# APIS DO PROJETO
# Todas habilitadas independentemente do tier — algumas serão usadas
# apenas condicionalmente, mas o custo de habilitá-las é zero.
# =============================================================================

locals {
  required_apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "cloudscheduler.googleapis.com",
    "artifactregistry.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "iam.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.required_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# =============================================================================
# SERVICE ACCOUNT — Cloud Run usa esta conta para acessar todos os recursos
# =============================================================================

resource "google_service_account" "cloud_run" {
  account_id   = "${var.client_slug}-run-sa"
  display_name = "Cloud Run SA — ${var.client_name}"
  description  = "Service account usada pelos serviços Cloud Run do cliente ${var.client_name}"
}

resource "google_project_iam_member" "run_sa_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "run_sa_cloudsql_client" {
  count   = local.cfg.create_cloud_sql ? 1 : 0
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "run_sa_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# =============================================================================
# SECRETS NO SECRET MANAGER
# Secrets são criados com valores placeholder — populados externamente
# (pelo deploy.sh ou manualmente). O Cloud Run os referencia por secretKeyRef.
# =============================================================================

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "${var.client_slug}-jwt-secret"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "firebase_sa" {
  secret_id = "${var.client_slug}-firebase-sa"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "${var.client_slug}-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "redis_url" {
  secret_id = "${var.client_slug}-redis-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# =============================================================================
# MÓDULO: NETWORKING (VPC privada + Cloud NAT)
# Criado apenas nos tiers growth e enterprise para comunicação interna.
# =============================================================================

module "networking" {
  count  = local.cfg.create_vpc ? 1 : 0
  source = "./modules/networking"

  project_id   = var.project_id
  region       = var.region
  client_slug  = var.client_slug

  depends_on = [google_project_service.apis]
}

# =============================================================================
# MÓDULO: CLOUD SQL (PostgreSQL 15)
# Criado apenas nos tiers growth e enterprise.
# =============================================================================

module "cloud_sql" {
  count  = local.cfg.create_cloud_sql ? 1 : 0
  source = "./modules/cloud-sql"

  project_id    = var.project_id
  region        = var.region
  client_slug   = var.client_slug
  db_sql_tier   = local.cfg.db_sql_tier
  enable_ha     = local.cfg.enable_ha
  vpc_id        = local.cfg.create_vpc ? module.networking[0].vpc_id : ""
  secret_id     = google_secret_manager_secret.database_url.secret_id

  depends_on = [module.networking, google_project_service.apis]
}

# =============================================================================
# MÓDULO: MEMORYSTORE (Redis 7 HA)
# Criado apenas no tier enterprise.
# =============================================================================

module "memorystore" {
  count  = local.cfg.create_memorystore ? 1 : 0
  source = "./modules/memorystore"

  project_id      = var.project_id
  region          = var.region
  client_slug     = var.client_slug
  redis_memory_gb = local.cfg.redis_memory_gb
  vpc_id          = module.networking[0].vpc_id

  depends_on = [module.networking, google_project_service.apis]
}

# =============================================================================
# MÓDULO: STORAGE (Cloud Storage para mídia)
# Sempre presente em todos os tiers.
# =============================================================================

module "storage" {
  source = "./modules/storage"

  project_id            = var.project_id
  region                = var.region
  client_slug           = var.client_slug
  domain                = var.domain
  cloud_run_sa_email    = google_service_account.cloud_run.email

  depends_on = [google_project_service.apis]
}

# =============================================================================
# MÓDULO: CLOUD RUN (API + Worker)
# Sempre presente. Recebe DATABASE_URL e REDIS_URL resolvidas por tier.
# =============================================================================

module "cloud_run" {
  source = "./modules/cloud-run"

  project_id            = var.project_id
  region                = var.region
  client_slug           = var.client_slug
  client_name           = var.client_name
  environment           = var.environment
  app_url               = var.app_url

  artifact_registry_url = local.artifact_registry_url
  service_account_email = google_service_account.cloud_run.email

  min_instances  = local.cfg.run_min_instances
  max_instances  = local.cfg.run_max_instances
  memory         = local.cfg.run_memory
  cpu            = local.cfg.run_cpu

  # Referências de secret no Secret Manager (nunca valores diretos)
  secret_database_url_id = google_secret_manager_secret.database_url.secret_id
  secret_redis_url_id    = google_secret_manager_secret.redis_url.secret_id
  secret_jwt_id          = google_secret_manager_secret.jwt_secret.secret_id
  secret_firebase_sa_id  = google_secret_manager_secret.firebase_sa.secret_id

  # Cloud SQL connection name para o proxy (vazio no tier starter)
  cloudsql_connection_name = local.cfg.create_cloud_sql ? module.cloud_sql[0].connection_name : ""

  depends_on = [
    module.cloud_sql,
    module.memorystore,
    module.storage,
    google_project_service.apis,
    google_project_iam_member.run_sa_secret_accessor,
  ]
}

# =============================================================================
# OUTPUTS — URLs e identificadores importantes pós-deploy
# =============================================================================

output "api_url" {
  description = "URL pública do serviço Cloud Run (API)"
  value       = module.cloud_run.api_url
}

output "worker_url" {
  description = "URL do serviço Cloud Run (Worker — acesso restrito)"
  value       = module.cloud_run.worker_url
}

output "storage_bucket" {
  description = "Nome do bucket Cloud Storage para arquivos de mídia"
  value       = module.storage.bucket_name
}

output "db_connection_name" {
  description = "Connection name do Cloud SQL (vazio no tier starter)"
  value       = local.cfg.create_cloud_sql ? module.cloud_sql[0].connection_name : ""
}

output "redis_host" {
  description = "Host do Memorystore Redis (vazio nos tiers starter e growth)"
  value       = local.cfg.create_memorystore ? module.memorystore[0].host : ""
  sensitive   = true
}

output "active_tier" {
  description = "Tier de infraestrutura ativo (útil para debug e auditoria)"
  value       = var.tier
}

output "service_account_email" {
  description = "Email da service account usada pelos serviços Cloud Run"
  value       = google_service_account.cloud_run.email
}

output "artifact_registry_url" {
  description = "URL base do Artifact Registry para push de imagens Docker"
  value       = local.artifact_registry_url
}

variable "project_id" {
  description = "ID do projeto GCP"
  type        = string
}

variable "region" {
  description = "Região GCP"
  type        = string
}

variable "client_slug" {
  description = "Slug do cliente para nomear recursos"
  type        = string
}

variable "client_name" {
  description = "Nome legível do cliente"
  type        = string
}

variable "environment" {
  description = "Ambiente (dev | staging | production)"
  type        = string
}

variable "app_url" {
  description = "URL pública da aplicação"
  type        = string
}

variable "artifact_registry_url" {
  description = "URL base do Artifact Registry (sem trailing slash)"
  type        = string
}

variable "service_account_email" {
  description = "Email da service account do Cloud Run"
  type        = string
}

variable "min_instances" {
  description = "Número mínimo de instâncias (0 = escala a zero)"
  type        = number
}

variable "max_instances" {
  description = "Número máximo de instâncias"
  type        = number
}

variable "memory" {
  description = "Limite de memória por instância (ex: 256Mi, 512Mi, 1Gi)"
  type        = string
}

variable "cpu" {
  description = "Limite de CPU por instância (ex: 1, 2)"
  type        = string
}

variable "secret_database_url_id" {
  description = "ID do secret DATABASE_URL no Secret Manager"
  type        = string
}

variable "secret_redis_url_id" {
  description = "ID do secret REDIS_URL no Secret Manager"
  type        = string
}

variable "secret_jwt_id" {
  description = "ID do secret JWT_SECRET no Secret Manager"
  type        = string
}

variable "secret_firebase_sa_id" {
  description = "ID do secret da service account Firebase no Secret Manager"
  type        = string
}

variable "cloudsql_connection_name" {
  description = "Connection name do Cloud SQL para o proxy (vazio no tier starter)"
  type        = string
  default     = ""
}

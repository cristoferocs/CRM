variable "project_id" {
  description = "ID do projeto GCP"
  type        = string
}

variable "region" {
  description = "Região GCP"
  type        = string
}

variable "client_slug" {
  description = "Slug do cliente"
  type        = string
}

variable "db_sql_tier" {
  description = "Tier da instância Cloud SQL (ex: db-g1-small, db-n1-standard-2)"
  type        = string
}

variable "enable_ha" {
  description = "Habilitar alta disponibilidade (REGIONAL) — obrigatório no tier enterprise"
  type        = bool
  default     = false
}

variable "vpc_id" {
  description = "ID da VPC para configurar IP privado"
  type        = string
}

variable "secret_id" {
  description = "ID do secret no Secret Manager onde a connection string será salva"
  type        = string
}

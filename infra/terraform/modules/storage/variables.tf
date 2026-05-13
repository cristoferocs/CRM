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

variable "domain" {
  description = "Domínio da aplicação para configuração de CORS"
  type        = string
}

variable "cloud_run_sa_email" {
  description = "Email da service account do Cloud Run (receberá roles/storage.objectAdmin)"
  type        = string
}

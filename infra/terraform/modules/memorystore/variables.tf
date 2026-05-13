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

variable "redis_memory_gb" {
  description = "Tamanho da memória Redis em GB"
  type        = number
  default     = 2
}

variable "vpc_id" {
  description = "ID da VPC para acesso privado ao Redis"
  type        = string
}

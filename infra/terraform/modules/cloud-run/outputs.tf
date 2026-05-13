output "api_url" {
  description = "URL pública do serviço Cloud Run API"
  value       = google_cloud_run_v2_service.api.uri
}

output "worker_url" {
  description = "URL do serviço Cloud Run Worker"
  value       = google_cloud_run_v2_service.worker.uri
}

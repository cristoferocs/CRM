output "host" {
  description = "IP do host Memorystore Redis (dentro da VPC)"
  value       = google_redis_instance.main.host
  sensitive   = true
}

output "port" {
  description = "Porta do Memorystore Redis"
  value       = google_redis_instance.main.port
}

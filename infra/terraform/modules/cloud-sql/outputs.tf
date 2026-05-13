output "connection_name" {
  description = "Connection name do Cloud SQL (usado no Cloud Run proxy)"
  value       = google_sql_database_instance.main.connection_name
}

output "private_ip" {
  description = "IP privado da instância Cloud SQL (dentro da VPC)"
  value       = google_sql_database_instance.main.private_ip_address
  sensitive   = true
}

output "instance_name" {
  description = "Nome da instância Cloud SQL"
  value       = google_sql_database_instance.main.name
}

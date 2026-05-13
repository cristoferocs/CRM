output "vpc_id" {
  description = "ID da VPC (self_link)"
  value       = google_compute_network.vpc.self_link
}

output "vpc_name" {
  description = "Nome da VPC"
  value       = google_compute_network.vpc.name
}

output "subnet_id" {
  description = "ID da subnet privada"
  value       = google_compute_subnetwork.private.id
}

output "connector_id" {
  description = "ID do VPC Access Connector (usado pelo Cloud Run)"
  value       = google_vpc_access_connector.connector.id
}

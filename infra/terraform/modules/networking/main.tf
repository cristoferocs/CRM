# =============================================================================
# NETWORKING — VPC privada + Cloud NAT
# Criado apenas nos tiers growth e enterprise (via count no main.tf raiz).
# Necessário para Cloud SQL com IP privado e Memorystore.
# =============================================================================

resource "google_compute_network" "vpc" {
  name                    = "${var.client_slug}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "private" {
  name          = "${var.client_slug}-private"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id

  # Logs de fluxo para diagnóstico e segurança
  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }

  private_ip_google_access = true
}

# Intervalo de IPs para peering com serviços gerenciados (Cloud SQL, Memorystore)
resource "google_compute_global_address" "private_service_range" {
  name          = "${var.client_slug}-private-service-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

# Peering com a rede de serviços do Google (necessário para Cloud SQL IP privado)
resource "google_service_networking_connection" "private_service" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range.name]
}

# Cloud Router — necessário para o Cloud NAT
resource "google_compute_router" "router" {
  name    = "${var.client_slug}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

# Cloud NAT — permite que instâncias sem IP público acessem a internet
# (para downloads de dependências, webhooks de saída, etc.)
resource "google_compute_router_nat" "nat" {
  name                               = "${var.client_slug}-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# VPC Access Connector — permite que Cloud Run acesse recursos na VPC
resource "google_vpc_access_connector" "connector" {
  name          = "${var.client_slug}-connector"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.8.0.0/28"
  min_instances = 2
  max_instances = 10
}

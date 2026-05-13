output "bucket_name" {
  description = "Nome do bucket Cloud Storage"
  value       = google_storage_bucket.media.name
}

output "bucket_url" {
  description = "URL do bucket (gs://...)"
  value       = "gs://${google_storage_bucket.media.name}"
}

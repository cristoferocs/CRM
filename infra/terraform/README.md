# Terraform

IaC para provisionar recursos GCP por tier:

- `starter`: integra Neon e Upstash externos.
- `growth`: Cloud SQL + Upstash.
- `enterprise`: Cloud SQL HA + Memorystore + Vertex AI Vector Search.

Os modulos Terraform devem ser adicionados conforme os servicos forem implementados.
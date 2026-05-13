# =============================================================================
# EXEMPLO DE CONFIGURAÇÃO — TIER STARTER (menor custo, ideal para novos clientes)
# =============================================================================
# Neste tier:
#   - Banco de dados: Neon DB (serverless PostgreSQL externo, plano gratuito disponível)
#   - Redis: Upstash (serverless Redis externo, plano gratuito disponível)
#   - Cloud Run: escala a zero (sem custo em idle)
#   - Sem VPC, sem Cloud SQL, sem Memorystore
#   - Custo estimado: ~$0–$5/mês dependendo do tráfego
#
# Para mudar para tier="growth":
#   - Altere tier = "starter" para tier = "growth"
#   - O Terraform provisionará automaticamente:
#       * VPC privada + Cloud NAT
#       * Cloud SQL PostgreSQL 15 (db-g1-small)
#       * Cloud Run com mínimo 1 instância (sem cold start)
#   - Custo estimado: ~$40–$80/mês
#   - Execute infra/scripts/upgrade-tier.sh --client agencia-xyz --from-tier starter --to-tier growth
#     para migrar os dados do Neon para o Cloud SQL automaticamente
#
# Para mudar para tier="enterprise":
#   - Altere tier = "growth" para tier = "enterprise"
#   - O Terraform provisionará automaticamente:
#       * Cloud SQL HA (REGIONAL, db-n1-standard-2) com point-in-time recovery
#       * Memorystore Redis 7 HA (STANDARD_HA, 2 GB)
#       * Cloud Run com mínimo 2 instâncias e escala até 50
#       * Cloud CDN + Cloud Armor (WAF)
#   - Custo estimado: ~$300–$500/mês
#   - Execute infra/scripts/upgrade-tier.sh --client agencia-xyz --from-tier growth --to-tier enterprise
# =============================================================================

project_id   = "crm-cliente-xyz-prod"
region       = "southamerica-east1"
client_name  = "Agência XYZ"
client_slug  = "agencia-xyz"
environment  = "production"
app_url      = "https://crm.agenciaxyz.com.br"
domain       = "crm.agenciaxyz.com.br"
tier         = "starter"

# Credenciais dos serviços externos (obrigatórias no tier starter)
# No tier enterprise o Terraform ignora esses valores (usa Cloud SQL + Memorystore)
neon_db_url       = "postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/crm?sslmode=require"
upstash_redis_url = "rediss://default:xxx@xxx.upstash.io:6379"

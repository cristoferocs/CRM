#!/usr/bin/env bash
# =============================================================================
# new-client.sh — Provisionamento interativo de um novo cliente
#
# Uso: ./infra/scripts/new-client.sh
#
# O script solicita as informações interativamente, valida o projeto GCP
# e gera os arquivos de configuração Terraform prontos para uso.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/../terraform"
EXAMPLE_TFVARS="${TERRAFORM_DIR}/variables.example.tfvars"

echo "=========================================="
echo "  CRM Base — Novo Cliente"
echo "=========================================="
echo ""

# ─── Coleta de informações ────────────────────────────────────────────────────
read -rp "Nome do cliente (ex: Agência XYZ): " CLIENT_NAME
read -rp "Slug do cliente [a-z0-9-] (ex: agencia-xyz): " CLIENT_SLUG
read -rp "GCP Project ID (ex: crm-agencia-xyz-prod): " GCP_PROJECT_ID
read -rp "Domínio (ex: crm.agenciaxyz.com.br): " DOMAIN
read -rp "Tier [starter|growth|enterprise] (padrão: starter): " TIER_INPUT
TIER="${TIER_INPUT:-starter}"

# Valida slug
if ! echo "$CLIENT_SLUG" | grep -qE '^[a-z0-9][a-z0-9-]{1,}[a-z0-9]$'; then
  echo "Erro: slug inválido. Use apenas letras minúsculas, números e hífens."
  exit 1
fi

# Valida tier
if [[ ! "$TIER" =~ ^(starter|growth|enterprise)$ ]]; then
  echo "Erro: tier deve ser starter, growth ou enterprise."
  exit 1
fi

TFVARS_FILE="${TERRAFORM_DIR}/${CLIENT_SLUG}.tfvars"

if [[ -f "$TFVARS_FILE" ]]; then
  echo "Erro: arquivo ${TFVARS_FILE} já existe. Use deploy.sh para atualizar."
  exit 1
fi

# ─── Valida projeto GCP ───────────────────────────────────────────────────────
echo ""
echo "▶ Validando projeto GCP '${GCP_PROJECT_ID}'..."

if ! gcloud projects describe "$GCP_PROJECT_ID" &>/dev/null; then
  echo "Erro: projeto '${GCP_PROJECT_ID}' não encontrado ou sem permissão."
  echo "Verifique com: gcloud projects list"
  exit 1
fi

echo "  ✓ Projeto encontrado."

# ─── Coleta URLs externas (se tier starter/growth) ────────────────────────────
NEON_DB_URL=""
UPSTASH_REDIS_URL=""

if [[ "$TIER" == "starter" ]]; then
  echo ""
  echo "Tier 'starter' selecionado. Informe as credenciais dos serviços externos:"
  read -rsp "  Neon DB URL (postgresql://...): " NEON_DB_URL
  echo ""
  read -rsp "  Upstash Redis URL (rediss://...): " UPSTASH_REDIS_URL
  echo ""
fi

if [[ "$TIER" == "growth" ]]; then
  echo ""
  read -rsp "  Upstash Redis URL (rediss://...): " UPSTASH_REDIS_URL
  echo ""
fi

# ─── Gera .tfvars ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Gerando ${CLIENT_SLUG}.tfvars..."

cat > "$TFVARS_FILE" <<EOF
# Gerado por new-client.sh em $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Cliente: ${CLIENT_NAME}

project_id   = "${GCP_PROJECT_ID}"
region       = "southamerica-east1"
client_name  = "${CLIENT_NAME}"
client_slug  = "${CLIENT_SLUG}"
environment  = "production"
app_url      = "https://${DOMAIN}"
domain       = "${DOMAIN}"
tier         = "${TIER}"
EOF

if [[ -n "$NEON_DB_URL" ]]; then
  echo "neon_db_url       = \"${NEON_DB_URL}\"" >> "$TFVARS_FILE"
fi

if [[ -n "$UPSTASH_REDIS_URL" ]]; then
  echo "upstash_redis_url = \"${UPSTASH_REDIS_URL}\"" >> "$TFVARS_FILE"
fi

echo "  ✓ Arquivo criado: ${TFVARS_FILE}"

# ─── Cria bucket de state do Terraform ───────────────────────────────────────
STATE_BUCKET="${CLIENT_SLUG}-terraform-state"
echo ""
echo "▶ Criando bucket de state do Terraform: gs://${STATE_BUCKET}..."

if ! gcloud storage buckets describe "gs://${STATE_BUCKET}" &>/dev/null; then
  gcloud storage buckets create "gs://${STATE_BUCKET}" \
    --project="$GCP_PROJECT_ID" \
    --location="southamerica-east1" \
    --uniform-bucket-level-access \
    --public-access-prevention
  echo "  ✓ Bucket criado."
else
  echo "  ✓ Bucket já existe."
fi

# ─── Próximos passos ──────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  ✅ Cliente '${CLIENT_NAME}' configurado!"
echo "=========================================="
echo ""
echo "Próximos passos:"
echo ""
echo "  1. Revise o arquivo gerado:"
echo "     ${TFVARS_FILE}"
echo ""
echo "  2. Adicione os secrets ao Secret Manager:"
echo "     gcloud secrets versions add ${CLIENT_SLUG}-jwt-secret --data-file=- <<< 'SEU_JWT_SECRET'"
echo "     gcloud secrets versions add ${CLIENT_SLUG}-firebase-sa --data-file=firebase-sa.json"
if [[ "$TIER" != "starter" ]]; then
  echo "     # DATABASE_URL será preenchida automaticamente pelo Terraform após criar o Cloud SQL"
fi
echo ""
echo "  3. Execute o primeiro deploy:"
echo "     ./infra/scripts/deploy.sh --client ${CLIENT_SLUG} --env production"
echo ""
echo "  4. Configure o DNS:"
echo "     CNAME ${DOMAIN} → URL do Cloud Run (exibida ao final do deploy)"
echo ""
if [[ "$TIER" == "starter" ]]; then
  echo "  Para fazer upgrade de tier no futuro:"
  echo "     ./infra/scripts/upgrade-tier.sh --client ${CLIENT_SLUG} --from-tier starter --to-tier growth"
fi

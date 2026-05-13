#!/usr/bin/env bash
# =============================================================================
# upgrade-tier.sh — Upgrade de tier de infraestrutura para um cliente
#
# Uso: ./infra/scripts/upgrade-tier.sh --client <slug> --from-tier <tier> --to-tier <tier>
#
# Fluxos suportados:
#   starter  → growth     (migra dados Neon → Cloud SQL)
#   growth   → enterprise (adiciona Cloud SQL HA + Memorystore)
#
# IMPORTANTE: sempre faça backup antes de executar.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/../terraform"
REPO_ROOT="${SCRIPT_DIR}/../.."
START_TIME=$(date +%s)

# ─── Argumentos ──────────────────────────────────────────────────────────────
CLIENT=""
FROM_TIER=""
TO_TIER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --client)     CLIENT="$2";     shift 2 ;;
    --from-tier)  FROM_TIER="$2";  shift 2 ;;
    --to-tier)    TO_TIER="$2";    shift 2 ;;
    *) echo "Argumento desconhecido: $1"; exit 1 ;;
  esac
done

[[ -z "$CLIENT" ]]    && { echo "Erro: --client é obrigatório";    exit 1; }
[[ -z "$FROM_TIER" ]] && { echo "Erro: --from-tier é obrigatório"; exit 1; }
[[ -z "$TO_TIER" ]]   && { echo "Erro: --to-tier é obrigatório";   exit 1; }

TFVARS_FILE="${TERRAFORM_DIR}/${CLIENT}.tfvars"

if [[ ! -f "$TFVARS_FILE" ]]; then
  echo "Erro: ${TFVARS_FILE} não encontrado."
  exit 1
fi

# ─── Funções utilitárias ──────────────────────────────────────────────────────
elapsed() {
  local end_time=$(date +%s)
  echo "$(( end_time - START_TIME ))s"
}

validate_health() {
  local url="$1"
  local retries=10
  echo "  Verificando health check em ${url}/health..."
  for i in $(seq 1 $retries); do
    if curl -sf "${url}/health" | grep -q '"status":"ok"'; then
      echo "  ✓ API respondendo corretamente."
      return 0
    fi
    echo "  Tentativa ${i}/${retries}... aguardando 10s"
    sleep 10
  done
  echo "  ✗ Health check falhou após ${retries} tentativas."
  return 1
}

rollback_instructions() {
  echo ""
  echo "⚠️  INSTRUÇÕES DE ROLLBACK:"
  echo "  1. Reverter o tier no .tfvars:"
  echo "     sed -i 's/tier = \"${TO_TIER}\"/tier = \"${FROM_TIER}\"/' ${TFVARS_FILE}"
  echo "  2. Re-aplicar Terraform:"
  echo "     cd ${TERRAFORM_DIR} && terraform apply -var-file=${CLIENT}.tfvars -auto-approve"
  echo "  3. (starter→growth): restaurar DATABASE_URL do Neon no Secret Manager"
  echo "     gcloud secrets versions add ${CLIENT}-database-url --data-file=- <<< 'postgresql://...@neon.tech/...'"
}

# ─── Validação da combinação de tiers ────────────────────────────────────────
if [[ "$FROM_TIER" == "starter" && "$TO_TIER" == "growth" ]]; then
  echo "=========================================="
  echo "  Upgrade: starter → growth"
  echo "  Cliente: ${CLIENT}"
  echo "=========================================="
  echo ""
  echo "Este upgrade irá:"
  echo "  • Criar VPC privada + Cloud NAT"
  echo "  • Criar Cloud SQL PostgreSQL 15 (db-g1-small)"
  echo "  • Migrar dados do Neon DB para Cloud SQL"
  echo "  • Atualizar DATABASE_URL no Secret Manager"
  echo ""
  read -rp "Confirmar upgrade? [s/N]: " CONFIRM
  [[ ! "$CONFIRM" =~ ^[sS]$ ]] && { echo "Upgrade cancelado."; exit 0; }

  # 1. Extrai URL do Neon do .tfvars
  NEON_URL=$(grep -E '^neon_db_url\s*=' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')
  if [[ -z "$NEON_URL" ]]; then
    echo "Erro: neon_db_url não encontrada em ${TFVARS_FILE}."
    exit 1
  fi

  # 2. Backup do banco Neon
  BACKUP_FILE="/tmp/${CLIENT}_neon_backup_$(date +%Y%m%d_%H%M%S).sql"
  echo "▶ Fazendo backup do Neon DB em ${BACKUP_FILE}..."
  pg_dump "$NEON_URL" \
    --no-owner \
    --no-acl \
    --format=plain \
    --file="$BACKUP_FILE"
  echo "  ✓ Backup concluído: $(wc -c < "$BACKUP_FILE" | numfmt --to=iec) bytes"

  # 3. Aplica Terraform com tier=growth (cria Cloud SQL)
  echo "▶ Aplicando Terraform para tier=growth..."
  sed -i 's/^tier\s*=.*$/tier = "growth"/' "$TFVARS_FILE"
  cd "$TERRAFORM_DIR"
  terraform init -reconfigure
  terraform apply -var-file="${CLIENT}.tfvars" -auto-approve

  # 4. Aguarda Cloud SQL ficar disponível
  echo "▶ Aguardando Cloud SQL ficar disponível..."
  INSTANCE_NAME=$(terraform output -raw db_connection_name | cut -d: -f3)
  PROJECT_ID=$(grep -E '^project_id\s*=' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')
  GCP_REGION=$(grep -E '^region\s*=' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/' || echo "southamerica-east1")

  for i in $(seq 1 30); do
    STATUS=$(gcloud sql instances describe "$INSTANCE_NAME" \
      --project="$PROJECT_ID" \
      --format='value(state)' 2>/dev/null || echo "PENDING")
    [[ "$STATUS" == "RUNNABLE" ]] && break
    echo "  Estado: ${STATUS} (tentativa ${i}/30)..."
    sleep 10
  done

  # 5. Importa backup para Cloud SQL
  echo "▶ Importando backup para Cloud SQL..."
  CLOUD_SQL_URL=$(gcloud secrets versions access latest \
    --secret="${CLIENT}-database-url" \
    --project="$PROJECT_ID" | tr -d '"')

  psql "$CLOUD_SQL_URL" < "$BACKUP_FILE"
  echo "  ✓ Dados importados com sucesso."

  # 6. Força redeploy do Cloud Run para pegar nova DATABASE_URL
  echo "▶ Atualizando Cloud Run..."
  gcloud run services update "${CLIENT}-api" \
    --region="$GCP_REGION" \
    --project="$PROJECT_ID" \
    --no-traffic \
    --set-env-vars="TIER_UPGRADE=$(date +%s)" 2>/dev/null || true

  gcloud run services update-traffic "${CLIENT}-api" \
    --region="$GCP_REGION" \
    --project="$PROJECT_ID" \
    --to-latest

  # 7. Validação
  API_URL=$(terraform output -raw api_url)
  if ! validate_health "$API_URL"; then
    rollback_instructions
    exit 1
  fi

elif [[ "$FROM_TIER" == "growth" && "$TO_TIER" == "enterprise" ]]; then
  echo "=========================================="
  echo "  Upgrade: growth → enterprise"
  echo "  Cliente: ${CLIENT}"
  echo "=========================================="
  echo ""
  echo "Este upgrade irá:"
  echo "  • Habilitar Cloud SQL HA (REGIONAL + point-in-time recovery)"
  echo "  • Criar Memorystore Redis 7 HA (STANDARD_HA, 2 GB)"
  echo "  • Atualizar Cloud Run com min 2 instâncias e max 50"
  echo "  • Habilitar Cloud CDN + Cloud Armor"
  echo ""
  echo "⚠️  Nota: o upgrade do Cloud SQL para HA causa ~1-2 min de indisponibilidade."
  echo ""
  read -rp "Confirmar upgrade? [s/N]: " CONFIRM
  [[ ! "$CONFIRM" =~ ^[sS]$ ]] && { echo "Upgrade cancelado."; exit 0; }

  PROJECT_ID=$(grep -E '^project_id\s*=' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')
  GCP_REGION=$(grep -E '^region\s*=' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/' || echo "southamerica-east1")

  # 1. Aplica Terraform com tier=enterprise
  echo "▶ Aplicando Terraform para tier=enterprise..."
  sed -i 's/^tier\s*=.*$/tier = "enterprise"/' "$TFVARS_FILE"
  cd "$TERRAFORM_DIR"
  terraform init -reconfigure
  terraform apply -var-file="${CLIENT}.tfvars" -auto-approve

  # 2. Atualiza REDIS_URL no Secret Manager com o host do Memorystore
  REDIS_HOST=$(terraform output -raw redis_host)
  REDIS_URL="redis://${REDIS_HOST}:6379"
  echo "▶ Atualizando secret REDIS_URL para Memorystore..."
  echo -n "$REDIS_URL" | gcloud secrets versions add "${CLIENT}-redis-url" \
    --project="$PROJECT_ID" \
    --data-file=-
  echo "  ✓ Secret atualizado."

  # 3. Força redeploy do Cloud Run
  echo "▶ Atualizando Cloud Run para usar Memorystore..."
  gcloud run services update "${CLIENT}-api" \
    --region="$GCP_REGION" \
    --project="$PROJECT_ID" \
    --no-traffic \
    --set-env-vars="TIER_UPGRADE=$(date +%s)" 2>/dev/null || true

  gcloud run services update-traffic "${CLIENT}-api" \
    --region="$GCP_REGION" \
    --project="$PROJECT_ID" \
    --to-latest

  gcloud run services update "${CLIENT}-worker" \
    --region="$GCP_REGION" \
    --project="$PROJECT_ID" \
    --no-traffic \
    --set-env-vars="TIER_UPGRADE=$(date +%s)" 2>/dev/null || true

  gcloud run services update-traffic "${CLIENT}-worker" \
    --region="$GCP_REGION" \
    --project="$PROJECT_ID" \
    --to-latest

  # 4. Validação
  API_URL=$(terraform output -raw api_url)
  if ! validate_health "$API_URL"; then
    rollback_instructions
    exit 1
  fi

else
  echo "Erro: fluxo de upgrade não suportado: ${FROM_TIER} → ${TO_TIER}"
  echo "Fluxos suportados:"
  echo "  starter  → growth"
  echo "  growth   → enterprise"
  exit 1
fi

# ─── Resultado ────────────────────────────────────────────────────────────────
END_ELAPSED=$(elapsed)
echo ""
echo "=========================================="
echo "  ✅ Upgrade concluído em ${END_ELAPSED}!"
echo "=========================================="
echo ""
echo "  Cliente  : ${CLIENT}"
echo "  De       : ${FROM_TIER}"
echo "  Para     : ${TO_TIER}"
echo "  API URL  : $(cd "$TERRAFORM_DIR" && terraform output -raw api_url)"
echo ""
echo "Em caso de problemas, use as instruções de rollback acima."

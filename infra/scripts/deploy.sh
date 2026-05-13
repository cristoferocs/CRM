#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Build, push e deploy de um cliente no GCP
#
# Uso: ./infra/scripts/deploy.sh --client <slug> --env <environment>
#
# Pré-requisitos:
#   - gcloud autenticado com permissões no projeto
#   - docker configurado para o Artifact Registry
#   - terraform >= 1.6 instalado
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/../terraform"
REPO_ROOT="${SCRIPT_DIR}/../.."

# ─── Argumentos ──────────────────────────────────────────────────────────────
CLIENT=""
ENV=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --client) CLIENT="$2"; shift 2 ;;
    --env)    ENV="$2";    shift 2 ;;
    *) echo "Argumento desconhecido: $1"; exit 1 ;;
  esac
done

[[ -z "$CLIENT" ]] && { echo "Erro: --client é obrigatório"; exit 1; }
[[ -z "$ENV" ]]    && { echo "Erro: --env é obrigatório (dev|staging|production)"; exit 1; }

TFVARS_FILE="${TERRAFORM_DIR}/${CLIENT}.tfvars"

# ─── 1. Valida .tfvars ────────────────────────────────────────────────────────
echo "▶ Validando ${CLIENT}.tfvars..."
if [[ ! -f "$TFVARS_FILE" ]]; then
  echo "Erro: arquivo ${TFVARS_FILE} não encontrado."
  echo "Crie-o com: cp infra/terraform/variables.example.tfvars infra/terraform/${CLIENT}.tfvars"
  exit 1
fi

# Extrai project_id e region do .tfvars
PROJECT_ID=$(grep -E '^project_id\s*=' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')
GCP_REGION=$(grep -E '^region\s*=' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/' || echo "southamerica-east1")
ARTIFACT_REGISTRY="${GCP_REGION}-docker.pkg.dev/${PROJECT_ID}/crm"

# ─── 2. Docker build e push ───────────────────────────────────────────────────
COMMIT_HASH=$(git -C "$REPO_ROOT" rev-parse --short HEAD)
echo "▶ Build das imagens Docker (commit: ${COMMIT_HASH})..."

gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

docker build \
  -f "${SCRIPT_DIR}/../docker/Dockerfile.api" \
  -t "${ARTIFACT_REGISTRY}/crm-api:${COMMIT_HASH}" \
  -t "${ARTIFACT_REGISTRY}/crm-api:latest" \
  "$REPO_ROOT"

docker build \
  -f "${SCRIPT_DIR}/../docker/Dockerfile.worker" \
  -t "${ARTIFACT_REGISTRY}/crm-worker:${COMMIT_HASH}" \
  -t "${ARTIFACT_REGISTRY}/crm-worker:latest" \
  "$REPO_ROOT"

echo "▶ Push das imagens para Artifact Registry..."
docker push "${ARTIFACT_REGISTRY}/crm-api:${COMMIT_HASH}"
docker push "${ARTIFACT_REGISTRY}/crm-api:latest"
docker push "${ARTIFACT_REGISTRY}/crm-worker:${COMMIT_HASH}"
docker push "${ARTIFACT_REGISTRY}/crm-worker:latest"

# ─── 3. Terraform ─────────────────────────────────────────────────────────────
echo "▶ Inicializando Terraform..."
cd "$TERRAFORM_DIR"
terraform init -reconfigure

echo "▶ Aplicando Terraform (cliente: ${CLIENT}, env: ${ENV})..."
terraform apply \
  -var-file="${CLIENT}.tfvars" \
  -var="environment=${ENV}" \
  -auto-approve

# ─── 4. Prisma Migrate ────────────────────────────────────────────────────────
echo "▶ Executando prisma migrate deploy..."

# Recupera DATABASE_URL do output do Terraform
DB_CONNECTION_NAME=$(terraform output -raw db_connection_name 2>/dev/null || echo "")

if [[ -n "$DB_CONNECTION_NAME" ]]; then
  # Tier growth/enterprise: Cloud SQL — executa via Cloud Run Jobs ou proxy local
  echo "  Cloud SQL detectado: ${DB_CONNECTION_NAME}"
  echo "  Execute manualmente: gcloud sql connect ou use Cloud Run Jobs para migrações."
else
  # Tier starter: Neon DB — migração direta
  DATABASE_URL=$(grep -E '^neon_db_url\s*=' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')
  if [[ -n "$DATABASE_URL" ]]; then
    cd "$REPO_ROOT"
    DATABASE_URL="$DATABASE_URL" pnpm --filter @crm-base/api exec prisma migrate deploy
  fi
fi

# ─── 5. Resultado ─────────────────────────────────────────────────────────────
cd "$TERRAFORM_DIR"
API_URL=$(terraform output -raw api_url)
ACTIVE_TIER=$(terraform output -raw active_tier)

echo ""
echo "✅ Deploy concluído!"
echo "   Cliente    : ${CLIENT}"
echo "   Ambiente   : ${ENV}"
echo "   Tier        : ${ACTIVE_TIER}"
echo "   API URL    : ${API_URL}"
echo "   Imagem     : ${ARTIFACT_REGISTRY}/crm-api:${COMMIT_HASH}"

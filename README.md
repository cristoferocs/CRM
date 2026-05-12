# crm-base

CRM white-label em monorepo com Turborepo, Next.js 14, Fastify 4 e TypeScript 5.

## Estrutura

```txt
crm-base/
├── apps/
│   ├── web/          # Next.js 14 com App Router
│   └── api/          # Fastify com TypeScript
├── packages/
│   ├── shared/       # Tipos TypeScript compartilhados
│   ├── config/       # ESLint e tsconfig compartilhados
│   └── ui/           # Design system base com shadcn/ui
├── infra/
│   ├── terraform/    # IaC para GCP
│   ├── docker/       # Dockerfiles
│   └── scripts/      # Deploy, seed e new-client
├── docs/
├── turbo.json
├── package.json
├── .env.example
└── .gitignore
```

## Requisitos

- Node.js 20+
- pnpm 9+

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Por padrao:

- Web: http://localhost:3000
- API: http://localhost:3333

## Scripts

```bash
pnpm dev        # roda apps em modo desenvolvimento
pnpm build      # build de apps e packages
pnpm lint       # lint do monorepo
pnpm test       # testes do monorepo
pnpm typecheck  # checagem TypeScript
```

## Infra tiers

- `starter`: Neon + Upstash
- `growth`: Cloud SQL + Upstash
- `enterprise`: Cloud SQL HA + Memorystore

## AI providers

O provedor ativo e controlado por `AI_PROVIDER` e pode ser `google`, `anthropic`, `openai` ou `ollama`. A intencao e permitir troca de provider sem alterar codigo de dominio.

## Proximos passos sugeridos

1. Adicionar ORM e migrations para PostgreSQL.
2. Implementar autenticacao com Firebase Auth.
3. Criar modulos de tenants/clientes para white-label.
4. Completar Terraform para cada tier de infraestrutura.
# Arquitetura

O `crm-base` separa aplicacoes, packages compartilhados e infraestrutura:

- `apps/web`: interface Next.js 14 com App Router.
- `apps/api`: API Fastify em TypeScript.
- `packages/shared`: contratos e tipos comuns.
- `packages/ui`: design system base compativel com shadcn/ui.
- `packages/config`: presets compartilhados de TypeScript e ESLint.

Os tenants white-label devem ser isolados por configuracao, branding e dados de dominio.
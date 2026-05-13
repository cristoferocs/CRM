/**
 * S09 — Activities, Timeline, Audit Log
 * Popula: Activity, TimelineEvent, AuditLog
 * Idempotente: usa count por dealId+type+title
 * Depende: .seed-ids.json (S01-S08)
 */

import { PrismaClient, ActivityType } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_IDS_PATH = path.join(__dirname, ".seed-ids.json");

function readSeedIds(): Record<string, unknown> {
    try {
        return JSON.parse(fs.readFileSync(SEED_IDS_PATH, "utf-8"));
    } catch {
        throw new Error("❌ .seed-ids.json não encontrado. Execute S01-S08 primeiro.");
    }
}

function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function hoursAgo(n: number): Date {
    return new Date(Date.now() - n * 60 * 60 * 1000);
}

function daysFromNow(n: number): Date {
    return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function addActivity(opts: {
    type: ActivityType;
    title: string;
    description?: string;
    dealId?: string;
    contactId?: string;
    userId: string;
    orgId: string;
    dueAt?: Date;
    completedAt?: Date;
    createdAt?: Date;
}): Promise<void> {
    const existing = await prisma.activity.findFirst({
        where: { dealId: opts.dealId ?? null, title: opts.title, orgId: opts.orgId },
        select: { id: true },
    });
    if (existing) return;

    await prisma.activity.create({
        data: {
            type: opts.type,
            title: opts.title,
            description: opts.description,
            dealId: opts.dealId,
            contactId: opts.contactId,
            userId: opts.userId,
            orgId: opts.orgId,
            dueAt: opts.dueAt,
            completedAt: opts.completedAt,
            createdAt: opts.createdAt ?? new Date(),
        },
    });
}

async function addTimeline(opts: {
    type: string;
    title: string;
    description?: string;
    metadata?: Record<string, unknown>;
    contactId: string;
    userId?: string;
    orgId: string;
    createdAt?: Date;
}): Promise<void> {
    const existing = await prisma.timelineEvent.findFirst({
        where: { contactId: opts.contactId, title: opts.title, orgId: opts.orgId },
        select: { id: true },
    });
    if (existing) return;

    await prisma.timelineEvent.create({
        data: {
            type: opts.type,
            title: opts.title,
            description: opts.description,
            metadata: opts.metadata ?? {},
            contactId: opts.contactId,
            userId: opts.userId,
            orgId: opts.orgId,
            createdAt: opts.createdAt ?? new Date(),
        },
    });
}

async function addAudit(opts: {
    action: string;
    resource: string;
    resourceId: string;
    oldData?: Record<string, unknown>;
    newData?: Record<string, unknown>;
    userId?: string;
    orgId: string;
    ip?: string;
    createdAt?: Date;
}): Promise<void> {
    const existing = await prisma.auditLog.findFirst({
        where: { action: opts.action, resource: opts.resource, resourceId: opts.resourceId, orgId: opts.orgId },
        select: { id: true },
    });
    if (existing) return;

    await prisma.auditLog.create({
        data: {
            action: opts.action,
            resource: opts.resource,
            resourceId: opts.resourceId,
            oldData: opts.oldData,
            newData: opts.newData,
            userId: opts.userId,
            orgId: opts.orgId,
            ip: opts.ip ?? "177.0.0.1",
            userAgent: "Mozilla/5.0 (demo seed)",
            createdAt: opts.createdAt ?? new Date(),
        },
    });
}

async function main() {
    const raw = readSeedIds() as {
        orgId: string;
        users: Record<string, string>;
        contacts: Record<string, string>;
        deals: Record<string, string>;
        pipelines: { main: string; campaign: string; renewal: string };
        agents: { sofia: string; max: string };
    };

    const { orgId } = raw;
    const u = raw.users;
    const c = raw.contacts;
    const d = raw.deals;

    // =========================================================================
    // ACTIVITIES (~20)
    // =========================================================================

    // Deal 1 — Camila (novo lead ativo)
    await addActivity({ type: ActivityType.SYSTEM, title: "Deal criado via Meta Ads", description: "Lead capturado pela campanha campanha-meta-jan-2025 e inserido no funil automaticamente.", dealId: d.deal1, contactId: c.camila, userId: u.admin, orgId, createdAt: hoursAgo(2) });
    await addActivity({ type: ActivityType.TASK, title: "Fazer follow-up após demo agendada", description: "Camila agendou demo para terça às 14h. Confirmar presença na manhã do dia.", dealId: d.deal1, contactId: c.camila, userId: u.ricardo, orgId, dueAt: daysFromNow(2) });

    // Deal 2 — Felipe (rotting)
    await addActivity({ type: ActivityType.WHATSAPP, title: "Primeiro contato via WhatsApp", description: "Lead respondeu ao anúncio. Engajamento inicial feito pela Sofia.", dealId: d.deal2, contactId: c.felipe, userId: u.juliana, orgId, completedAt: daysAgo(4), createdAt: daysAgo(4) });
    await addActivity({ type: ActivityType.TASK, title: "Reengajar Felipe — 4 dias sem resposta", description: "Deal rotting. Enviar mensagem de reativação com case study do segmento.", dealId: d.deal2, contactId: c.felipe, userId: u.juliana, orgId, dueAt: daysFromNow(1) });

    // Deal 8 — Diego (proposta rotting)
    await addActivity({ type: ActivityType.EMAIL, title: "Proposta enviada por email", description: "Proposta Growth R$2.497/mês enviada em PDF com comparativo de planos.", dealId: d.deal8, contactId: c.diego, userId: u.ricardo, orgId, completedAt: daysAgo(6), createdAt: daysAgo(6) });
    await addActivity({ type: ActivityType.CALL, title: "Tentativa de ligação — sem resposta", description: "Tentei ligar para Diego, caixa postal. Deixei recado para retornar.", dealId: d.deal8, contactId: c.diego, userId: u.ricardo, orgId, completedAt: daysAgo(3), createdAt: daysAgo(3) });
    await addActivity({ type: ActivityType.TASK, title: "Reabordagem urgente — deal rotting 6 dias", description: "Proposta enviada há 6 dias sem feedback. Acionar Sofia para mensagem automatizada.", dealId: d.deal8, contactId: c.diego, userId: u.ricardo, orgId, dueAt: new Date() });

    // Deal 11 — Beatriz (negociação avançada)
    await addActivity({ type: ActivityType.MEETING, title: "Reunião de apresentação realizada", description: "Demo completa com Beatriz e head de marketing. Ótima recepção. Pediu comparativo com HubSpot.", dealId: d.deal11, contactId: c.beatriz, userId: u.ricardo, orgId, completedAt: daysAgo(5), createdAt: daysAgo(5) });
    await addActivity({ type: ActivityType.EMAIL, title: "Comparativo Nexus vs HubSpot enviado", description: "Documento de 5 páginas com comparativo técnico e financeiro enviado para beatriz@empresa.com.", dealId: d.deal11, contactId: c.beatriz, userId: u.fernanda, orgId, completedAt: daysAgo(4), createdAt: daysAgo(4) });
    await addActivity({ type: ActivityType.CALL, title: "Call de negociação — 45 minutos", description: "Discutimos condições de pagamento. Beatriz quer parcelamento anual. Vou consultar diretoria.", dealId: d.deal11, contactId: c.beatriz, userId: u.ricardo, orgId, completedAt: daysAgo(2), createdAt: daysAgo(2) });
    await addActivity({ type: ActivityType.TASK, title: "Enviar proposta anual com desconto fidelidade", description: "Aprovado 12% desconto no plano anual. Gerar contrato e enviar para assinatura digital.", dealId: d.deal11, contactId: c.beatriz, userId: u.ricardo, orgId, dueAt: daysFromNow(1) });

    // Deal 13 — Clínica (fechado ganho)
    await addActivity({ type: ActivityType.SYSTEM, title: "Deal fechado — Plano Starter ativado", description: "Clínica Saúde Plena assinou o plano Starter. Onboarding iniciado.", dealId: d.deal13, contactId: c.clinica, userId: u.admin, orgId, completedAt: daysAgo(5), createdAt: daysAgo(5) });
    await addActivity({ type: ActivityType.MEETING, title: "Onboarding inicial realizado", description: "Sessão de 1h com equipe da clínica. WhatsApp conectado, pipeline configurado, 3 usuários criados.", dealId: d.deal13, contactId: c.clinica, userId: u.juliana, orgId, completedAt: daysAgo(4), createdAt: daysAgo(4) });
    await addActivity({ type: ActivityType.NOTE, title: "Nota: Cliente muito satisfeito, indicou Odonto Sorrir", description: "Dr. Carlos mencionou que tem um colega dentista interessado. Pedir referral formal.", dealId: d.deal13, contactId: c.clinica, userId: u.juliana, orgId, createdAt: daysAgo(4) });

    // Deal 15 — Startup Beta (perdido)
    await addActivity({ type: ActivityType.CALL, title: "Ligação de recuperação — sem sucesso", description: "Thiago tentou reverter decisão. Cliente já assinou com Pipedrive. Manteve cordialidade para contato futuro.", dealId: d.deal15, contactId: c.leticia, userId: u.thiago, orgId, completedAt: daysAgo(8), createdAt: daysAgo(8) });
    await addActivity({ type: ActivityType.NOTE, title: "Post-mortem: perdido para Pipedrive por preço", description: "Decisor comparou por usuário, não por funcionalidade. Criar case de ROI específico para startups.", dealId: d.deal15, contactId: c.leticia, userId: u.thiago, orgId, createdAt: daysAgo(7) });

    // Deal 12 — Marcos (negociação enterprise)
    await addActivity({ type: ActivityType.MEETING, title: "Executive meeting — Fernanda + CEO Marcos", description: "Reunião estratégica. Marcos quer incluir módulo de recrutamento. Analisar viabilidade.", dealId: d.deal12, contactId: c.marcos, userId: u.fernanda, orgId, completedAt: daysAgo(3), createdAt: daysAgo(3) });
    await addActivity({ type: ActivityType.TASK, title: "Elaborar escopo para módulo de RH — Enterprise", description: "Marcos solicitou proposta customizada incluindo pipeline de recrutamento.", dealId: d.deal12, contactId: c.marcos, userId: u.fernanda, orgId, dueAt: daysFromNow(3) });

    // =========================================================================
    // TIMELINE EVENTS (~13)
    // =========================================================================

    // Camila (3)
    await addTimeline({ type: "lead_created", title: "Lead capturado via Meta Ads", description: "Camila entrou no sistema via campanha campanha-meta-jan-2025", metadata: { source: "META_ADS", campaign: "campanha-meta-jan-2025", utmSource: "facebook" }, contactId: c.camila, userId: u.admin, orgId, createdAt: hoursAgo(2) });
    await addTimeline({ type: "deal_created", title: "Deal criado: Camila Rodrigues — Starter", description: "Funil Principal de Vendas — Etapa Novo Lead", metadata: { dealTitle: "Camila Rodrigues — Starter", value: 997, pipeline: "Funil Principal de Vendas" }, contactId: c.camila, userId: u.admin, orgId, createdAt: hoursAgo(2) });
    await addTimeline({ type: "demo_scheduled", title: "Demo agendada: Terça 14h com Ricardo", description: "Sofia conduziu qualificação e agendou demonstração", metadata: { scheduledWith: "Ricardo Silva", dateTime: daysFromNow(2).toISOString() }, contactId: c.camila, orgId, createdAt: minutesAgo(5) });

    // Clínica (6)
    await addTimeline({ type: "lead_created", title: "Lead criado manualmente", description: "Clínica Saúde Plena adicionada ao CRM", metadata: { source: "MANUAL", addedBy: "Juliana" }, contactId: c.clinica, userId: u.juliana, orgId, createdAt: daysAgo(20) });
    await addTimeline({ type: "deal_created", title: "Deal criado: Clínica Saúde Plena — Starter", description: "Funil Principal — Novo Lead", metadata: { value: 997 }, contactId: c.clinica, userId: u.juliana, orgId, createdAt: daysAgo(20) });
    await addTimeline({ type: "ai_qualification", title: "Sofia qualificou o lead", description: "Agente Sofia completou qualificação: segmento clínica odontológica, equipe 8 pessoas", metadata: { agentName: "Sofia", segment: "clínica", teamSize: 8 }, contactId: c.clinica, orgId, createdAt: daysAgo(15) });
    await addTimeline({ type: "proposal_sent", title: "Proposta enviada por Juliana", description: "Plano Starter R$997/mês enviado por WhatsApp", metadata: { plan: "starter", value: 997, sentVia: "WhatsApp" }, contactId: c.clinica, userId: u.juliana, orgId, createdAt: daysAgo(12) });
    await addTimeline({ type: "deal_won", title: "Deal fechado! Plano Starter ativado", description: "Sofia detectou buying signal e moveu deal para Fechado Ganho", metadata: { agentName: "Sofia", buyingSignal: "perguntou sobre onboarding" }, contactId: c.clinica, orgId, createdAt: daysAgo(5) });
    await addTimeline({ type: "payment_confirmed", title: "Pagamento confirmado — R$997", description: "MercadoPago processou o pagamento do Plano Starter", metadata: { gateway: "MercadoPago", amount: 997, invoice: "NF-001245" }, contactId: c.clinica, userId: u.admin, orgId, createdAt: daysAgo(5) });

    // Diego (4)
    await addTimeline({ type: "lead_created", title: "Lead capturado via ADS", description: "Diego entrou pelo funil de campanha Meta Ads", metadata: { source: "ADS" }, contactId: c.diego, userId: u.admin, orgId, createdAt: daysAgo(12) });
    await addTimeline({ type: "ai_qualification", title: "Sofia qualificou o lead", description: "Qualificação completa: 11-30 funcionários, usa planilha", metadata: { teamSize: "11-30", currentTool: "planilha" }, contactId: c.diego, orgId, createdAt: daysAgo(8) });
    await addTimeline({ type: "proposal_sent", title: "Proposta enviada por Ricardo", description: "Proposta Growth R$2.497/mês enviada por email", metadata: { plan: "growth", value: 2497, sentVia: "email" }, contactId: c.diego, userId: u.ricardo, orgId, createdAt: daysAgo(6) });
    await addTimeline({ type: "deal_rotting", title: "Deal parado há 6 dias ⚠️", description: "Sofia enviou mensagem de reengajamento automaticamente", metadata: { rottingDays: 6, autoMessage: true }, contactId: c.diego, orgId, createdAt: hoursAgo(1) });

    // =========================================================================
    // AUDIT LOGS (~15)
    // =========================================================================

    await addAudit({ action: "user.login", resource: "user", resourceId: u.admin, newData: { email: "carlos@nexusdemo.com.br" }, userId: u.admin, orgId, ip: "187.60.1.45", createdAt: daysAgo(30) });
    await addAudit({ action: "pipeline.created", resource: "pipeline", resourceId: raw.pipelines.main, newData: { name: "Funil Principal de Vendas", type: "SALES" }, userId: u.admin, orgId, createdAt: daysAgo(29) });
    await addAudit({ action: "agent.activated", resource: "ai_agent", resourceId: raw.agents.sofia, newData: { name: "Sofia", status: "ACTIVE", phase: "PRODUCTION" }, userId: u.admin, orgId, createdAt: daysAgo(25) });
    await addAudit({ action: "agent.flow_approved", resource: "ai_agent", resourceId: raw.agents.sofia, newData: { version: 1, approvedBy: u.admin, notes: "Flow aprovado para produção" }, userId: u.admin, orgId, createdAt: daysAgo(25) });
    await addAudit({ action: "deal.moved_by_agent", resource: "deal", resourceId: d.deal5, newData: { fromStage: "Novo Lead", toStage: "Qualificado", agent: "Sofia", reason: "Lead qualificado pela Sofia" }, orgId, createdAt: daysAgo(1) });
    await addAudit({ action: "whitelabel.updated", resource: "organization", resourceId: orgId, oldData: { primaryColor: "#7c5cfc" }, newData: { primaryColor: "#00d97e", logo: "nexus-logo.png" }, userId: u.admin, orgId, createdAt: daysAgo(20) });
    await addAudit({ action: "user.created", resource: "user", resourceId: u.fernanda, newData: { name: "Fernanda Lima", role: "MANAGER", email: "fernanda@nexusdemo.com.br" }, userId: u.admin, orgId, createdAt: daysAgo(28) });
    await addAudit({ action: "user.role_changed", resource: "user", resourceId: u.thiago, oldData: { role: "SELLER" }, newData: { role: "SELLER", departmentId: "comercial" }, userId: u.admin, orgId, createdAt: daysAgo(27) });
    await addAudit({ action: "pipeline.duplicated", resource: "pipeline", resourceId: raw.pipelines.campaign, newData: { name: "Campanha Meta Ads — Produto Digital", sourceId: raw.pipelines.main }, userId: u.admin, orgId, createdAt: daysAgo(15) });
    await addAudit({ action: "agent.paused", resource: "ai_agent", resourceId: raw.agents.max, oldData: { status: "ACTIVE" }, newData: { status: "PAUSED", reason: "Ajuste de fluxo de suporte técnico" }, userId: u.admin, orgId, createdAt: daysAgo(10) });
    await addAudit({ action: "agent.activated", resource: "ai_agent", resourceId: raw.agents.max, oldData: { status: "PAUSED" }, newData: { status: "ACTIVE", phase: "PRODUCTION" }, userId: u.admin, orgId, createdAt: daysAgo(8) });
    await addAudit({ action: "deal.created", resource: "deal", resourceId: d.deal13, newData: { title: "Clínica Saúde Plena — Starter", value: 997, pipeline: "Funil Principal" }, userId: u.juliana, orgId, createdAt: daysAgo(20) });
    await addAudit({ action: "payment.confirmed", resource: "payment", resourceId: "demo-mp-clinica-jan", newData: { amount: 997, gateway: "MercadoPago", contactId: c.clinica }, orgId, createdAt: daysAgo(5) });
    await addAudit({ action: "knowledge.indexed", resource: "knowledge_base", resourceId: "kb1", newData: { name: "Produtos e Serviços", documentsIndexed: 3, chunksCreated: 10 }, userId: u.admin, orgId, createdAt: daysAgo(26) });
    await addAudit({ action: "training_data.validated", resource: "ai_training_data", resourceId: "td1", newData: { type: "OBJECTION_RESPONSE", validatedBy: u.admin }, userId: u.admin, orgId, createdAt: daysAgo(5) });

    console.log("✅ S09 — Activities: 20 | Timeline: 13 | Audit: 15");
}

function minutesAgo(n: number): Date {
    return new Date(Date.now() - n * 60 * 1000);
}

main()
    .catch((e) => {
        console.error("❌ S09 failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

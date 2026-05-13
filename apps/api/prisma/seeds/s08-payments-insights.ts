/**
 * S08 — Payments, AI Insights, AI Training Data
 * Popula: Payment, AIInsight, AITrainingData
 * Idempotente: usa findFirst por externalId/title
 * Depende: .seed-ids.json (S01-S07)
 */

import {
    PrismaClient,
    PaymentGateway,
    PaymentType,
    PaymentStatus,
    AIInsightType,
    AITrainingDataType,
} from "@prisma/client";
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
        throw new Error("❌ .seed-ids.json não encontrado. Execute S01-S07 primeiro.");
    }
}

function writeSeedIds(data: Record<string, unknown>): void {
    const existing = readSeedIds();
    fs.writeFileSync(SEED_IDS_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
}

function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function daysFromNow(n: number): Date {
    return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function upsertPayment(externalId: string, data: Parameters<typeof prisma.payment.create>[0]["data"]): Promise<string> {
    const existing = await prisma.payment.findFirst({ where: { externalId, orgId: data.orgId as string }, select: { id: true } });
    if (existing) return existing.id;
    const p = await prisma.payment.create({ data, select: { id: true } });
    return p.id;
}

async function main() {
    const raw = readSeedIds() as {
        orgId: string;
        users: Record<string, string>;
        contacts: Record<string, string>;
        deals: Record<string, string>;
        conversations: Record<string, string>;
    };

    const { orgId } = raw;
    const c = raw.contacts;
    const d = raw.deals;
    const conv = raw.conversations;
    const adminId = raw.users.admin;

    const payments: Record<string, string> = {};

    // =========================================================================
    // PAGAMENTOS
    // =========================================================================

    // P1 — Clínica / PAID / Starter (MercadoPago)
    payments.p1 = await upsertPayment("demo-mp-clinica-jan", {
        externalId: "demo-mp-clinica-jan",
        gateway: PaymentGateway.MERCADOPAGO,
        type: PaymentType.RECURRING,
        status: PaymentStatus.PAID,
        amount: 997,
        currency: "BRL",
        description: "Plano Starter — Janeiro 2025",
        contactId: c.clinica,
        dealId: d.deal13,
        orgId,
        paidAt: daysAgo(30),
        dueAt: daysAgo(30),
        metadata: { plan: "starter", period: "2025-01", invoice: "NF-001245" },
    });

    // P2 — Agência / PAID / Growth (Stripe)
    payments.p2 = await upsertPayment("demo-stripe-agencia-jan", {
        externalId: "demo-stripe-agencia-jan",
        gateway: PaymentGateway.STRIPE,
        type: PaymentType.RECURRING,
        status: PaymentStatus.PAID,
        amount: 2497,
        currency: "BRL",
        description: "Plano Growth — Janeiro 2025",
        contactId: c.agencia,
        dealId: d.deal14,
        orgId,
        paidAt: daysAgo(30),
        dueAt: daysAgo(30),
        metadata: { plan: "growth", period: "2025-01", invoice: "NF-001246" },
    });

    // P3 — Tech / PAID / Growth (Stripe)
    payments.p3 = await upsertPayment("demo-stripe-tech-jan", {
        externalId: "demo-stripe-tech-jan",
        gateway: PaymentGateway.STRIPE,
        type: PaymentType.RECURRING,
        status: PaymentStatus.PAID,
        amount: 2497,
        currency: "BRL",
        description: "Plano Growth — Janeiro 2025",
        contactId: c.tech,
        dealId: d.deal23,
        orgId,
        paidAt: daysAgo(30),
        dueAt: daysAgo(30),
        metadata: { plan: "growth", period: "2025-01", invoice: "NF-001247" },
    });

    // P4 — Grupo / PAID / Enterprise (MercadoPago)
    payments.p4 = await upsertPayment("demo-mp-grupo-jan", {
        externalId: "demo-mp-grupo-jan",
        gateway: PaymentGateway.MERCADOPAGO,
        type: PaymentType.RECURRING,
        status: PaymentStatus.PAID,
        amount: 12000,
        currency: "BRL",
        description: "Plano Enterprise — Janeiro 2025",
        contactId: c.grupo,
        dealId: d.deal22,
        orgId,
        paidAt: daysAgo(30),
        dueAt: daysAgo(30),
        metadata: { plan: "enterprise", period: "2025-01", invoice: "NF-001248" },
    });

    // P5 — Clínica / PENDING (fev)
    payments.p5 = await upsertPayment("demo-mp-clinica-fev", {
        externalId: "demo-mp-clinica-fev",
        gateway: PaymentGateway.MERCADOPAGO,
        type: PaymentType.RECURRING,
        status: PaymentStatus.PENDING,
        amount: 997,
        currency: "BRL",
        description: "Plano Starter — Fevereiro 2025",
        contactId: c.clinica,
        dealId: d.deal13,
        orgId,
        dueAt: daysFromNow(3),
        metadata: { plan: "starter", period: "2025-02" },
    });

    // P6 — Tech / PENDING (fev)
    payments.p6 = await upsertPayment("demo-stripe-tech-fev", {
        externalId: "demo-stripe-tech-fev",
        gateway: PaymentGateway.STRIPE,
        type: PaymentType.RECURRING,
        status: PaymentStatus.PENDING,
        amount: 2497,
        currency: "BRL",
        description: "Plano Growth — Fevereiro 2025",
        contactId: c.tech,
        dealId: d.deal23,
        orgId,
        dueAt: daysFromNow(5),
        metadata: { plan: "growth", period: "2025-02" },
    });

    // P7 — Beatriz / PENDING (deal11)
    payments.p7 = await upsertPayment("demo-stripe-beatriz-proposta", {
        externalId: "demo-stripe-beatriz-proposta",
        gateway: PaymentGateway.STRIPE,
        type: PaymentType.SINGLE,
        status: PaymentStatus.PENDING,
        amount: 4994,
        currency: "BRL",
        description: "Plano Growth Anual — Proposta",
        contactId: c.beatriz,
        dealId: d.deal11,
        orgId,
        expiresAt: daysFromNow(7),
        metadata: { plan: "growth", billing: "anual" },
    });

    // P8 — Grupo / FAILED (Stripe)
    payments.p8 = await upsertPayment("demo-stripe-grupo-failed", {
        externalId: "demo-stripe-grupo-failed",
        gateway: PaymentGateway.STRIPE,
        type: PaymentType.RECURRING,
        status: PaymentStatus.FAILED,
        amount: 12000,
        currency: "BRL",
        description: "Plano Enterprise — Tentativa duplicada",
        contactId: c.grupo,
        dealId: d.deal22,
        orgId,
        dueAt: daysAgo(1),
        metadata: { plan: "enterprise", failureReason: "Cartão recusado", failureCode: "card_declined" },
    });

    // P9 — Letícia / REFUNDED (MercadoPago)
    payments.p9 = await upsertPayment("demo-mp-leticia-refund", {
        externalId: "demo-mp-leticia-refund",
        gateway: PaymentGateway.MERCADOPAGO,
        type: PaymentType.SINGLE,
        status: PaymentStatus.REFUNDED,
        amount: 997,
        currency: "BRL",
        description: "Plano Starter — Reembolso solicitado",
        contactId: c.leticia,
        dealId: d.deal15,
        orgId,
        paidAt: daysAgo(20),
        metadata: { plan: "starter", refundReason: "Cliente optou por concorrente antes de ativar", refundedAt: daysAgo(8).toISOString() },
    });

    // P10 — Grupo / PAID histórico (60 dias atrás)
    payments.p10 = await upsertPayment("demo-mp-grupo-dez", {
        externalId: "demo-mp-grupo-dez",
        gateway: PaymentGateway.MERCADOPAGO,
        type: PaymentType.RECURRING,
        status: PaymentStatus.PAID,
        amount: 12000,
        currency: "BRL",
        description: "Plano Enterprise — Dezembro 2024",
        contactId: c.grupo,
        dealId: d.deal22,
        orgId,
        paidAt: daysAgo(60),
        dueAt: daysAgo(60),
        metadata: { plan: "enterprise", period: "2024-12", invoice: "NF-001180" },
    });

    // P11 — Agência / PAID histórico (42 dias atrás)
    payments.p11 = await upsertPayment("demo-stripe-agencia-dez", {
        externalId: "demo-stripe-agencia-dez",
        gateway: PaymentGateway.STRIPE,
        type: PaymentType.RECURRING,
        status: PaymentStatus.PAID,
        amount: 2497,
        currency: "BRL",
        description: "Plano Growth — Dezembro 2024",
        contactId: c.agencia,
        dealId: d.deal14,
        orgId,
        paidAt: daysAgo(42),
        dueAt: daysAgo(42),
        metadata: { plan: "growth", period: "2024-12", invoice: "NF-001181" },
    });

    // P12 — Rafael / PENDING link (Enterprise proposta)
    payments.p12 = await upsertPayment("demo-stripe-rafael-enterprise", {
        externalId: "demo-stripe-rafael-enterprise",
        gateway: PaymentGateway.STRIPE,
        type: PaymentType.SINGLE,
        status: PaymentStatus.PENDING,
        amount: 15000,
        currency: "BRL",
        description: "Plano Enterprise — Link de pagamento",
        contactId: c.rafael,
        dealId: d.deal10,
        orgId,
        dueAt: daysFromNow(10),
        expiresAt: daysFromNow(15),
        metadata: { plan: "enterprise", paymentLink: "https://checkout.nexus.com.br/demo-rafael-ent" },
    });

    // =========================================================================
    // AI INSIGHTS
    // =========================================================================
    const insights: string[] = [];

    const insightDefs: Array<{ type: AIInsightType; title: string; content: string; confidence: number; sourceConvIds: string[] }> = [
        {
            type: AIInsightType.OBJECTION,
            title: "Objeção recorrente: Preço acima do orçamento",
            content: "Em 67% das conversas analisadas, o principal bloqueio para fechamento é a percepção de preço alto. Os contatos comparam com Pipedrive (R$75/usuário) e HubSpot Free. Recomendação: apresentar ROI calculado (leads perdidos × ticket médio) antes de abordar preço.",
            confidence: 0.91,
            sourceConvIds: [conv.conv3, conv.conv2],
        },
        {
            type: AIInsightType.BEST_APPROACH,
            title: "Melhor abordagem: Demo personalizada por segmento",
            content: "Leads de imobiliárias e clínicas que recebem demo com casos de uso do próprio segmento convertem 3.2x mais. Sofia identificou que a pergunta de qualificação 'Qual o seu segmento?' logo no início aumenta o engajamento em 45%.",
            confidence: 0.87,
            sourceConvIds: [conv.conv1, conv.conv4],
        },
        {
            type: AIInsightType.COACHING,
            title: "Coaching: Ricardo tem rottingDays acima da média",
            content: "Analisando os deals de Ricardo nos últimos 30 dias, 4 de 8 deals na etapa Proposta Enviada estão rotting. Sugestão: criar sequência de follow-up automático com Sofia 3 dias após envio de proposta para desbloqueio proativo.",
            confidence: 0.83,
            sourceConvIds: [],
        },
        {
            type: AIInsightType.SENTIMENT,
            title: "Sentimento positivo: Campanha Meta Ads Jan/2025",
            content: "Leads oriundos da campanha de Meta Ads de Janeiro demonstram sentimento mais positivo (score 0.74) comparado a leads orgânicos (0.58). Primeira resposta mais rápida (< 2 minutos) correlaciona com taxa de qualificação 2.1x maior.",
            confidence: 0.88,
            sourceConvIds: [conv.conv1, conv.conv2],
        },
        {
            type: AIInsightType.SUMMARY,
            title: "Resumo semanal: Semana 03/2025",
            content: "Semana de 13-17 Jan: 12 novos leads, 8 qualificados pela Sofia, 3 propostas enviadas, 1 fechamento (Clínica Saúde Plena R$997). MRR adicionado: R$997. Deals em negociação: R$28.994. Taxa de conversão do pipeline: 8.3%.",
            confidence: 1.0,
            sourceConvIds: [],
        },
        {
            type: AIInsightType.OBJECTION,
            title: "Objeção: Dúvida sobre segurança dos dados (LGPD)",
            content: "3 empresas B2B questionaram sobre conformidade LGPD e localização dos dados. Recomendação: criar material de 1 página sobre infraestrutura (Google Cloud Brasil), criptografia e DPA disponível para envio imediato pelo agente.",
            confidence: 0.79,
            sourceConvIds: [conv.conv7],
        },
        {
            type: AIInsightType.BEST_APPROACH,
            title: "Gatilho de fechamento: Pergunta sobre onboarding = Buying Signal",
            content: "100% dos leads que perguntaram sobre processo de onboarding ou 'como funciona a implementação' fecharam ou estão em negociação final. Sofia deve sinalizar imediatamente ao vendedor responsável quando este gatilho for detectado.",
            confidence: 0.94,
            sourceConvIds: [conv.conv1, conv.conv4],
        },
        {
            type: AIInsightType.COACHING,
            title: "Coaching: Fernanda tem maior taxa de deals Enterprise",
            content: "Fernanda fechou 100% dos deals Enterprise que conduziu até a fase de negociação. Estratégia diferencial: personaliza a proposta com métricas do setor do cliente 24h antes da reunião de apresentação. Compartilhar template com restante do time.",
            confidence: 0.85,
            sourceConvIds: [],
        },
    ];

    for (const def of insightDefs) {
        const existing = await prisma.aIInsight.findFirst({ where: { title: def.title, orgId }, select: { id: true } });
        if (!existing) {
            const ins = await prisma.aIInsight.create({
                data: {
                    type: def.type,
                    title: def.title,
                    content: def.content,
                    confidence: def.confidence,
                    sourceConversationIds: def.sourceConvIds,
                    orgId,
                    metadata: {},
                },
                select: { id: true },
            });
            insights.push(ins.id);
        } else {
            insights.push(existing.id);
        }
    }

    // =========================================================================
    // AI TRAINING DATA
    // =========================================================================
    const trainingData: string[] = [];

    const trainingDefs: Array<{ type: AITrainingDataType; input: string; output: string; validated: boolean }> = [
        {
            type: AITrainingDataType.OBJECTION_RESPONSE,
            input: "O preço de vocês está muito caro comparado ao Pipedrive.",
            output: "Entendo a comparação! O Pipedrive cobra por usuário (em média R$150/usuário/mês para funcionalidades similares). Para uma equipe de 5 pessoas, você pagaria R$750/mês sem IA. Com o Nexus no Starter (R$997), você tem CRM completo + 2 agentes de IA que trabalham 24h captando e qualificando leads mesmo quando sua equipe está dormindo. Um agente que fecha 2 deals extras por mês já paga o plano inteiro. Faz sentido calcular isso juntos?",
            validated: true,
        },
        {
            type: AITrainingDataType.OBJECTION_RESPONSE,
            input: "Preciso pensar mais. Posso te dar uma resposta semana que vem?",
            output: "Claro! Entendo que é uma decisão importante. Enquanto isso, posso te enviar o caso de sucesso da [segmento do lead] que teve resultado em 30 dias? Também posso deixar agendada uma conversa rápida de 15 minutos na segunda — se até lá você já tiver decidido, ótimo; se quiser tirar dúvidas, também resolvemos. O que prefere?",
            validated: true,
        },
        {
            type: AITrainingDataType.SALES_APPROACH,
            input: "Lead pergunta sobre integração com WhatsApp.",
            output: "Temos integração nativa com WhatsApp Business (QR Code, gratuito) e WhatsApp API Oficial (via parceiro Meta, ideal para alto volume). A maioria dos nossos clientes começa com o Business e migra para API quando atinge 200+ mensagens/dia. Qual é o volume aproximado de mensagens que vocês recebem hoje?",
            validated: true,
        },
        {
            type: AITrainingDataType.FAQ,
            input: "Quanto tempo leva para implementar o sistema?",
            output: "Para pequenas equipes (1-5 usuários), implementação básica em 1 dia: você conecta o WhatsApp, importa os contatos e já começa a usar. Para configurações avançadas (agentes IA treinados, automações, pipelines customizados), o onboarding guiado leva em média 7-10 dias com suporte do nosso time.",
            validated: false,
        },
        {
            type: AITrainingDataType.PRODUCT_INFO,
            input: "Como funciona o agente de IA de vendas?",
            output: "O agente Sofia (nosso agente de vendas padrão) opera assim: 1) Recebe lead pelo canal configurado (WhatsApp, Instagram, etc.), 2) Realiza qualificação conversacional (segmento, tamanho, dor, orçamento), 3) Apresenta proposta de valor personalizada, 4) Agenda demo ou envia proposta, 5) Faz follow-up automático se o lead ficar inativo. Tudo com tom natural e contextualizado. Você pode customizar o script, produtos e objeções do agente.",
            validated: false,
        },
        {
            type: AITrainingDataType.SALES_APPROACH,
            input: "Lead qualificado não responde há 5+ dias.",
            output: "Olá [Nome]! 👋 Vi que fazem [X] dias desde nosso último contato sobre [produto/proposta]. Sei que a rotina está corrida — por isso quero facilitar: se ainda faz sentido explorar o Nexus CRM, posso reservar 20 minutos na sua agenda esta semana. Se por outro lado as prioridades mudaram, fica à vontade para me dizer — sem compromisso! O que prefere?",
            validated: false,
        },
    ];

    for (const def of trainingDefs) {
        const existing = await prisma.aITrainingData.findFirst({ where: { input: def.input, orgId }, select: { id: true } });
        if (!existing) {
            const td = await prisma.aITrainingData.create({
                data: {
                    type: def.type,
                    input: def.input,
                    output: def.output,
                    isValidated: def.validated,
                    validatedBy: def.validated ? adminId : null,
                    orgId,
                },
                select: { id: true },
            });
            trainingData.push(td.id);
        } else {
            trainingData.push(existing.id);
        }
    }

    // =========================================================================
    // PERSIST IDs
    // =========================================================================
    writeSeedIds({ payments, insights, trainingData });

    console.log("✅ S08 — Payments: 12 | Insights: 8 | Training: 6");
}

main()
    .catch((e) => {
        console.error("❌ S08 failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

/**
 * S10 — Automations & Documents
 * Popula: 6 automações demo + 8 documentos demo
 * Idempotente: usa findFirst antes de criar
 * Depende: .seed-ids.json (S01 / S06)
 */

import "dotenv/config";
import { PrismaClient, AutomationTriggerEnum, DocumentType, DocumentStatus } from "@prisma/client";
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
        throw new Error("❌ .seed-ids.json não encontrado. Execute S01 primeiro.");
    }
}

async function main() {
    const ids = readSeedIds() as {
        orgId: string;
        users: { admin: string; fernanda: string; ricardo: string };
        contacts?: Record<string, string>;
    };
    const orgId = ids.orgId;
    const userId = ids.users.admin;

    // =========================================================================
    // AUTOMATIONS
    // =========================================================================

    const automationDefs = [
        {
            name: "Boas-vindas ao Novo Lead",
            description: "Envia mensagem de boas-vindas quando um novo contato é criado",
            triggerType: AutomationTriggerEnum.CONTACT_CREATED,
            isActive: true,
            nodes: [
                { id: "trigger", type: "trigger", label: "Contato Criado", config: {}, position: { x: 200, y: 80 } },
                { id: "delay1", type: "delay", label: "Aguardar 5 min", config: { minutes: 5 }, position: { x: 200, y: 200 } },
                { id: "msg1", type: "send_whatsapp", label: "Mensagem WhatsApp", config: { message: "Olá {{contact.name}}! Bem-vindo à Nexus! 🚀" }, position: { x: 200, y: 320 } },
                { id: "tag1", type: "add_tag", label: "Tag: boas-vindas", config: { tag: "boas-vindas" }, position: { x: 200, y: 440 } },
            ],
            edges: [
                { from: "trigger", to: "delay1" },
                { from: "delay1", to: "msg1" },
                { from: "msg1", to: "tag1" },
            ],
        },
        {
            name: "Nutrição de Lead Morno",
            description: "Sequência de e-mails para leads mornos (score 30-60)",
            triggerType: AutomationTriggerEnum.LEAD_SCORE_CHANGED,
            isActive: true,
            nodes: [
                { id: "trigger", type: "trigger", label: "Score Alterado", config: { minScore: 30, maxScore: 60 }, position: { x: 200, y: 80 } },
                { id: "email1", type: "send_email", label: "Email: Case de Sucesso", config: { template: "case_success" }, position: { x: 200, y: 200 } },
                { id: "delay1", type: "delay", label: "Aguardar 2 dias", config: { days: 2 }, position: { x: 200, y: 320 } },
                { id: "email2", type: "send_email", label: "Email: Demo Grátis", config: { template: "free_demo" }, position: { x: 200, y: 440 } },
                { id: "task1", type: "create_task", label: "Tarefa: Follow-up", config: { title: "Follow-up {{contact.name}}" }, position: { x: 200, y: 560 } },
            ],
            edges: [
                { from: "trigger", to: "email1" },
                { from: "email1", to: "delay1" },
                { from: "delay1", to: "email2" },
                { from: "email2", to: "task1" },
            ],
        },
        {
            name: "Alerta de Deal Parado",
            description: "Notifica o vendedor quando um deal fica mais de 7 dias sem movimentação",
            triggerType: AutomationTriggerEnum.DEAL_ROTTING,
            isActive: true,
            nodes: [
                { id: "trigger", type: "trigger", label: "Deal Parado", config: { days: 7 }, position: { x: 200, y: 80 } },
                { id: "notify1", type: "notify_user", label: "Notificar Vendedor", config: { message: "⚠️ Deal {{deal.title}} parado há 7 dias!" }, position: { x: 200, y: 200 } },
                { id: "tag1", type: "add_tag", label: "Tag: atencao", config: { tag: "atencao" }, position: { x: 200, y: 320 } },
                { id: "task1", type: "create_task", label: "Tarefa: Reativar Deal", config: { title: "Reativar: {{deal.title}}", priority: "HIGH" }, position: { x: 200, y: 440 } },
            ],
            edges: [
                { from: "trigger", to: "notify1" },
                { from: "notify1", to: "tag1" },
                { from: "tag1", to: "task1" },
            ],
        },
        {
            name: "Onboarding Pós-Venda",
            description: "Sequência de onboarding quando um deal é ganho",
            triggerType: AutomationTriggerEnum.DEAL_WON,
            isActive: true,
            nodes: [
                { id: "trigger", type: "trigger", label: "Deal Ganho", config: {}, position: { x: 200, y: 80 } },
                { id: "email1", type: "send_email", label: "Email: Parabéns!", config: { template: "deal_won" }, position: { x: 200, y: 200 } },
                { id: "agent1", type: "activate_agent", label: "Ativar Agente Sofia", config: { agentType: "customer_success" }, position: { x: 200, y: 320 } },
                { id: "tag1", type: "add_tag", label: "Tag: cliente", config: { tag: "cliente" }, position: { x: 200, y: 440 } },
            ],
            edges: [
                { from: "trigger", to: "email1" },
                { from: "email1", to: "agent1" },
                { from: "agent1", to: "tag1" },
            ],
        },
        {
            name: "Recuperação de Pagamento",
            description: "Ação automática quando um pagamento fica em atraso",
            triggerType: AutomationTriggerEnum.PAYMENT_OVERDUE,
            isActive: false,
            nodes: [
                { id: "trigger", type: "trigger", label: "Pagamento Atrasado", config: {}, position: { x: 200, y: 80 } },
                { id: "email1", type: "send_email", label: "Email: Lembrete de Pagamento", config: { template: "payment_overdue" }, position: { x: 200, y: 200 } },
                { id: "delay1", type: "delay", label: "Aguardar 3 dias", config: { days: 3 }, position: { x: 200, y: 320 } },
                { id: "msg1", type: "send_whatsapp", label: "WhatsApp: Urgente", config: { message: "Olá {{contact.name}}, sua fatura está vencida. Regularize para evitar bloqueio." }, position: { x: 200, y: 440 } },
            ],
            edges: [
                { from: "trigger", to: "email1" },
                { from: "email1", to: "delay1" },
                { from: "delay1", to: "msg1" },
            ],
        },
        {
            name: "Teste A/B de Mensagem",
            description: "Testa duas abordagens de mensagem para novos leads",
            triggerType: AutomationTriggerEnum.MESSAGE_RECEIVED,
            isActive: false,
            nodes: [
                { id: "trigger", type: "trigger", label: "Mensagem Recebida", config: {}, position: { x: 200, y: 80 } },
                { id: "ab1", type: "ab_test", label: "Teste A/B", config: { splitA: 50, splitB: 50 }, position: { x: 200, y: 200 } },
                { id: "msgA", type: "send_whatsapp", label: "Versão A: Formal", config: { message: "Olá! Como posso ajudá-lo?" }, position: { x: 80, y: 320 } },
                { id: "msgB", type: "send_whatsapp", label: "Versão B: Casual", config: { message: "Oi! Tô aqui pra ajudar 😊" }, position: { x: 320, y: 320 } },
            ],
            edges: [
                { from: "trigger", to: "ab1" },
                { from: "ab1", to: "msgA", condition: "A" },
                { from: "ab1", to: "msgB", condition: "B" },
            ],
        },
    ];

    let autoCount = 0;
    for (const def of automationDefs) {
        const existing = await prisma.automation.findFirst({ where: { orgId, name: def.name } });
        if (!existing) {
            await prisma.automation.create({
                data: {
                    orgId,
                    name: def.name,
                    description: def.description,
                    triggerType: def.triggerType,
                    triggerConfig: {} as never,
                    isActive: def.isActive,
                    nodes: def.nodes as never,
                    edges: def.edges as never,
                    executionCount: Math.floor(Math.random() * 120),
                    successCount: Math.floor(Math.random() * 100),
                },
            });
            autoCount++;
        }
    }

    // =========================================================================
    // DOCUMENTS
    // =========================================================================

    // Find some contacts for linking
    const contacts = await prisma.contact.findMany({
        where: { orgId },
        select: { id: true, name: true },
        take: 8,
        orderBy: { createdAt: "asc" },
    });

    const deals = await prisma.deal.findMany({
        where: { orgId },
        select: { id: true, title: true },
        take: 8,
        orderBy: { createdAt: "asc" },
    });

    const documentDefs = [
        {
            name: "Contrato de Serviços — Agência Digital Vibe",
            type: DocumentType.CONTRACT,
            status: DocumentStatus.SIGNED,
            contact: 0,
            deal: 0,
            signers: [{ email: "contato@agvibe.com.br", name: "Carlos Souza", signedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() }],
            content: "Este contrato estabelece os termos de prestação de serviços de CRM entre Nexus Soluções Digitais e Agência Digital Vibe...",
        },
        {
            name: "Proposta Comercial — Clínica Saúde Plena",
            type: DocumentType.PROPOSAL,
            status: DocumentStatus.SENT,
            contact: 1,
            deal: 1,
            signers: [{ email: "financeiro@clinicasaudeplena.com.br", name: "Ana Lima" }],
            content: "Proposta de implementação de CRM e automação de marketing para a Clínica Saúde Plena...",
        },
        {
            name: "NDA — Parceria Estratégica TechForce",
            type: DocumentType.NDA,
            status: DocumentStatus.PARTIALLY_SIGNED,
            contact: 2,
            deal: 2,
            signers: [
                { email: "legal@techforce.com.br", name: "Pedro Alves", signedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
                { email: "compliance@techforce.com.br", name: "Marina Costa" },
            ],
            content: "Acordo de Não Divulgação entre Nexus Soluções Digitais e TechForce para tratamento de informações confidenciais...",
        },
        {
            name: "Fatura #2026-047 — Instituto Educar Mais",
            type: DocumentType.INVOICE,
            status: DocumentStatus.SIGNED,
            contact: 3,
            deal: 3,
            signers: [{ email: "financeiro@institutoedulcare.com.br", name: "Luiza Santos", signedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() }],
            content: "Fatura referente ao mês de Maio/2026 - Licença Nexus CRM Growth + Implementação...",
        },
        {
            name: "Relatório de ROI — Construtora Alvorada",
            type: DocumentType.OTHER,
            status: DocumentStatus.DRAFT,
            contact: 4,
            deal: 4,
            signers: [],
            content: "Relatório de retorno sobre investimento após 6 meses de uso do Nexus CRM na Construtora Alvorada...",
        },
        {
            name: "Contrato de Renovação — MedGroup",
            type: DocumentType.CONTRACT,
            status: DocumentStatus.SENT,
            contact: 5,
            deal: 5,
            signers: [{ email: "diretoria@medgroup.com.br", name: "Dr. Roberto Campos" }],
            content: "Renovação anual do contrato de licenciamento e suporte da plataforma Nexus CRM para MedGroup...",
        },
        {
            name: "Proposta Pack Enterprise — Logística Rápida",
            type: DocumentType.PROPOSAL,
            status: DocumentStatus.DRAFT,
            contact: 6,
            deal: 6,
            signers: [],
            content: "Proposta para contratação do pacote Enterprise com módulos de IA e automações avançadas...",
        },
        {
            name: "Adendo Contratual — Startup Fintech",
            type: DocumentType.CONTRACT,
            status: DocumentStatus.EXPIRED,
            contact: 7,
            deal: 7,
            signers: [{ email: "ceo@fintechstartup.com.br", name: "Beatriz Ramos" }],
            expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            content: "Adendo ao contrato original referente à expansão de módulos contratados...",
        },
    ];

    let docCount = 0;
    for (const def of documentDefs) {
        const existing = await prisma.document.findFirst({ where: { orgId, name: def.name } });
        if (!existing) {
            const contact = contacts[def.contact];
            const deal = deals[def.deal];
            await prisma.document.create({
                data: {
                    orgId,
                    name: def.name,
                    type: def.type,
                    status: def.status,
                    contactId: contact?.id ?? null,
                    dealId: deal?.id ?? null,
                    createdById: userId,
                    variables: {
                        content: def.content,
                        signers: def.signers,
                    } as never,
                    expiresAt: (def as { expiresAt?: Date }).expiresAt ?? null,
                    signers: def.signers as never,
                },
            });
            docCount++;
        }
    }

    // =========================================================================
    // LEAD SCORING CONFIG
    // =========================================================================
    const existingConfig = await prisma.leadScoringConfig.findFirst({ where: { orgId } });
    if (!existingConfig) {
        await prisma.leadScoringConfig.create({
            data: {
                orgId,
                isActive: true,
                hotThreshold: 70,
                warmThreshold: 35,
                demographicRules: {
                    hasEmail: 10, hasPhone: 8, hasCompany: 5, sourceBonus: 10,
                    dealCount: 8, dealWon: 25, openConversations: 5, recentActivity: 10, highValueDeal: 15,
                } as never,
            },
        });
        console.log("✅ Lead scoring config criada");
    }

    console.log(`✅ S10 — Automações: ${autoCount} criadas | Documentos: ${docCount} criados`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});

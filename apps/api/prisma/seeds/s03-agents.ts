/**
 * S03 — Agents
 * Popula: AIAgent, AgentFlowVersion, AgentLearningJob
 * Idempotente: usa findFirst antes de criar
 * Depende: .seed-ids.json (gerado por S01 e S02)
 */

import {
    PrismaClient,
    AgentType,
    AgentStatus,
    AgentPhase,
} from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_IDS_PATH = path.join(__dirname, ".seed-ids.json");

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readSeedIds(): Record<string, unknown> {
    try {
        return JSON.parse(fs.readFileSync(SEED_IDS_PATH, "utf-8"));
    } catch {
        throw new Error("❌ .seed-ids.json não encontrado. Execute S01 e S02 primeiro.");
    }
}

function writeSeedIds(data: Record<string, unknown>): void {
    const existing = readSeedIds();
    fs.writeFileSync(SEED_IDS_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
}

function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
    const ids = readSeedIds() as {
        orgId: string;
        users: { admin: string };
        knowledgeBases: { kb1: string; kb2: string; kb3: string };
    };

    const { orgId } = ids;
    const carlosUserId = ids.users.admin;
    const { kb1, kb2, kb3 } = ids.knowledgeBases;

    // =========================================================================
    // AGENTE 1 — Sofia (Vendas)
    // =========================================================================
    const sofiaFlow = {
        stages: [
            {
                id: "s1",
                name: "Abertura",
                order: 1,
                type: "ENTRY",
                questionsToAsk: ["Como posso te ajudar?", "Como nos conheceu?"],
                dataToCollect: ["nome_confirmado"],
                exitConditions: ["cliente demonstrou interesse"],
                maxMessages: 3,
            },
            {
                id: "s2",
                name: "Qualificação",
                order: 2,
                questionsToAsk: [
                    "Quantas pessoas na equipe?",
                    "Usam CRM?",
                    "Maior desafio?",
                ],
                dataToCollect: [
                    "company_size",
                    "current_tool",
                    "main_pain",
                    "decision_maker",
                ],
                exitConditions: ["dados obrigatórios coletados"],
                maxMessages: 8,
            },
            {
                id: "s3",
                name: "Apresentação",
                order: 3,
                questionsToAsk: ["Isso faz sentido para vocês?"],
                dataToCollect: ["interest_level"],
                exitConditions: ["interesse confirmado", "perguntou preço"],
                maxMessages: 5,
            },
            {
                id: "s4",
                name: "Proposta",
                order: 4,
                questionsToAsk: ["O que te impede de começar hoje?"],
                dataToCollect: ["budget", "objection", "decision_maker"],
                exitConditions: ["aceitou", "pediu pensar", "recusou"],
                handoffConditions: ["múltiplas objeções de preço", "pediu humano"],
                maxMessages: 6,
            },
            {
                id: "s5",
                name: "Fechamento",
                order: 5,
                questionsToAsk: ["Posso enviar o link para finalizar?"],
                dataToCollect: [],
                exitConditions: ["pagamento efetuado"],
                maxMessages: 4,
            },
        ],
        objectionPlaybook: [
            {
                pattern: "É caro|muito caro|não tenho orçamento",
                response:
                    "Entendo! Nossos clientes recuperam o investimento em ~60 dias. Posso mostrar os números?",
            },
            {
                pattern: "Preciso pensar|vou ver",
                response:
                    "Claro! O que especificamente você quer avaliar melhor? Posso ajudar a pensar.",
            },
            {
                pattern: "Já uso outro|tenho um sistema",
                response:
                    "Que legal! O que mais te incomoda no atual? Muitos vieram de outros CRMs pela IA.",
            },
        ],
        buyingSignals: [
            "quanto custa",
            "tem desconto",
            "como funciona o pagamento",
            "quando posso começar",
            "tem teste",
            "fazem migração",
        ],
        riskSignals: [
            "não tenho interesse",
            "já decidi por outro",
            "me tira da lista",
        ],
        metadata: {
            learnedFrom: 87,
            avgSuccessRate: 0.34,
            confidence: 0.89,
        },
    };

    let sofia = await prisma.aIAgent.findFirst({
        where: { orgId, name: "Sofia" },
        select: { id: true },
    });

    if (!sofia) {
        sofia = await prisma.aIAgent.create({
            data: {
                name: "Sofia",
                description: "Agente de vendas consultivo para qualificação e fechamento",
                type: AgentType.SALES,
                status: AgentStatus.ACTIVE,
                phase: AgentPhase.PRODUCTION,
                isActive: true,
                orgId,
                personality: {
                    name: "Sofia",
                    role: "Consultora de Vendas",
                    tone: "profissional mas próxima, empática, direta",
                    style: "faz perguntas abertas, escuta, não pressiona",
                },
                goal: "Qualificar o lead, entender suas necessidades reais, apresentar a solução ideal e conduzir até o fechamento de forma consultiva.",
                successCriteria: {
                    primary: "Deal marcado como Fechado Ganho",
                    secondary: "Proposta enviada com valor definido",
                    tertiary: "Reunião agendada com vendedor humano",
                },
                requiredDataPoints: [
                    {
                        field: "company_size",
                        question: "Quantas pessoas trabalham na empresa?",
                        required: true,
                    },
                    {
                        field: "current_tool",
                        question: "Vocês usam algum CRM hoje?",
                        required: true,
                    },
                    {
                        field: "main_pain",
                        question: "Qual o maior desafio de vendas hoje?",
                        required: true,
                    },
                    {
                        field: "decision_maker",
                        question: "Você é quem toma essa decisão?",
                        required: true,
                    },
                    {
                        field: "budget",
                        question: "Têm ideia de orçamento?",
                        required: false,
                    },
                    {
                        field: "timeline",
                        question: "Quando precisam ter isso funcionando?",
                        required: false,
                    },
                ],
                systemPrompt:
                    "Você é Sofia, consultora de vendas da Nexus CRM. Seu objetivo é qualificar leads de forma consultiva, entender suas necessidades reais e apresentar a solução mais adequada. Seja profissional, empática e direta. Faça perguntas abertas e escute ativamente. Nunca pressione — conduza com valor.",
                flowTemplate: sofiaFlow,
                knowledgeBaseIds: [kb1, kb2],
                enabledTools: {
                    get_contact_info: { enabled: true },
                    get_deals: { enabled: true },
                    create_deal: { enabled: true },
                    move_deal_stage: { enabled: true },
                    update_deal_value: { enabled: true },
                    update_deal_fields: { enabled: true },
                    qualify_and_advance: { enabled: true },
                    mark_deal_lost: { enabled: true, requiresConfirmation: true },
                    send_payment_link: { enabled: true, maxValue: 3000 },
                    check_calendar: { enabled: true },
                    create_appointment: { enabled: true },
                    search_knowledge: { enabled: true },
                    schedule_human_followup: { enabled: true },
                    check_objection_response: { enabled: true },
                },
                handoffRules: {
                    always: [
                        "pediu falar com humano",
                        "linguagem agressiva",
                        "ameaça jurídica",
                    ],
                    afterNTurns: 20,
                    ifObjectionRepeat: 3,
                    ifNegativeSentiment: 2,
                },
                maxTurnsBeforeHuman: 20,
                confidenceThreshold: 0.75,
                temperature: 0.4,
                maxTokens: 2048,
                learnedFromCount: 87,
                minimumLearningSample: 30,
                learningCompletedAt: daysAgo(25),
            },
            select: { id: true },
        });
    }

    // AgentFlowVersion — Sofia
    const sofiaVersion = await prisma.agentFlowVersion.findFirst({
        where: { agentId: sofia.id, version: 1 },
        select: { id: true },
    });
    if (!sofiaVersion) {
        await prisma.agentFlowVersion.create({
            data: {
                agentId: sofia.id,
                version: 1,
                flowTemplate: sofiaFlow,
                notes: "Versão gerada por aprendizado de 87 conversas",
                approvedBy: carlosUserId,
                approvedAt: daysAgo(20),
                isActive: true,
            },
        });
    }

    // AgentLearningJob — Sofia
    const sofiaJob = await prisma.agentLearningJob.findFirst({
        where: { agentId: sofia.id },
        select: { id: true },
    });
    if (!sofiaJob) {
        await prisma.agentLearningJob.create({
            data: {
                agentId: sofia.id,
                orgId,
                status: "completed",
                conversationIds: [],
                analyzedCount: 87,
                result: {
                    topObjections: ["preço", "timing", "decisão conjunta"],
                    avgTurns: 8.3,
                    successRate: 0.34,
                    suggestedImprovements: [
                        "Adicionar pergunta sobre urgência mais cedo",
                    ],
                },
                startedAt: daysAgo(30),
                completedAt: daysAgo(25),
            },
        });
    }

    // =========================================================================
    // AGENTE 2 — Max (Suporte)
    // =========================================================================
    const maxFlow = {
        stages: [
            {
                id: "s1",
                name: "Identificação",
                order: 1,
                questionsToAsk: ["Qual o problema?", "Quando começou?"],
                dataToCollect: ["problem_description", "plan", "urgency"],
                maxMessages: 4,
            },
            {
                id: "s2",
                name: "Diagnóstico",
                order: 2,
                questionsToAsk: ["Já tentou reiniciar?", "Aparece algum erro?"],
                keyActions: ["buscar_na_KB", "verificar_conta"],
                maxMessages: 5,
            },
            {
                id: "s3",
                name: "Resolução",
                order: 3,
                keyActions: ["aplicar_solução", "confirmar_resolução"],
                maxMessages: 4,
            },
            {
                id: "s4",
                name: "Conclusão",
                order: 4,
                keyActions: ["confirmar_satisfação", "documentar_para_KB"],
                maxMessages: 2,
            },
        ],
        objectionPlaybook: [],
        buyingSignals: [],
        riskSignals: ["quero cancelar", "vou processar", "péssimo serviço"],
        metadata: {
            learnedFrom: 54,
            avgSuccessRate: 0.81,
            confidence: 0.85,
        },
    };

    let max = await prisma.aIAgent.findFirst({
        where: { orgId, name: "Max" },
        select: { id: true },
    });

    if (!max) {
        max = await prisma.aIAgent.create({
            data: {
                name: "Max",
                description: "Agente de suporte técnico para resolução de dúvidas e problemas",
                type: AgentType.SUPPORT,
                status: AgentStatus.ACTIVE,
                phase: AgentPhase.PRODUCTION,
                isActive: true,
                orgId,
                personality: {
                    name: "Max",
                    role: "Especialista de Suporte",
                    tone: "técnico mas acessível, paciente",
                    style: "confirma o problema antes de resolver, documenta tudo",
                },
                goal: "Resolver dúvidas e problemas técnicos de forma rápida, garantindo satisfação e evitando escaladas desnecessárias.",
                successCriteria: {
                    primary: "Problema resolvido com confirmação do cliente",
                    secondary: "CSAT >= 4/5",
                    tertiary: "Resolução sem escalada para humano",
                },
                requiredDataPoints: [
                    {
                        field: "problem_description",
                        question: "Me descreve o que está acontecendo?",
                        required: true,
                    },
                    {
                        field: "plan",
                        question: "Qual plano você utiliza?",
                        required: true,
                    },
                    {
                        field: "urgency",
                        question: "Isso impacta suas operações agora?",
                        required: true,
                    },
                ],
                systemPrompt:
                    "Você é Max, especialista de suporte da Nexus CRM. Seu objetivo é resolver dúvidas e problemas técnicos de forma eficiente e empática. Sempre confirme o problema antes de propor solução. Seja técnico mas acessível.",
                flowTemplate: maxFlow,
                knowledgeBaseIds: [kb3],
                enabledTools: {
                    get_contact_info: { enabled: true },
                    get_deals: { enabled: true },
                    get_payments: { enabled: true },
                    get_service_status: { enabled: true },
                    search_knowledge: { enabled: true },
                    schedule_human_followup: { enabled: true },
                },
                handoffRules: {
                    always: ["quero cancelar", "falar com gerente"],
                    afterNTurns: 15,
                },
                maxTurnsBeforeHuman: 15,
                confidenceThreshold: 0.75,
                temperature: 0.3,
                maxTokens: 2048,
                learnedFromCount: 54,
                minimumLearningSample: 30,
                learningCompletedAt: daysAgo(15),
            },
            select: { id: true },
        });
    }

    // AgentFlowVersion — Max
    const maxVersion = await prisma.agentFlowVersion.findFirst({
        where: { agentId: max.id, version: 1 },
        select: { id: true },
    });
    if (!maxVersion) {
        await prisma.agentFlowVersion.create({
            data: {
                agentId: max.id,
                version: 1,
                flowTemplate: maxFlow,
                notes: "Versão gerada por aprendizado de 54 conversas de suporte",
                approvedBy: carlosUserId,
                approvedAt: daysAgo(10),
                isActive: true,
            },
        });
    }

    // AgentLearningJob — Max
    const maxJob = await prisma.agentLearningJob.findFirst({
        where: { agentId: max.id },
        select: { id: true },
    });
    if (!maxJob) {
        await prisma.agentLearningJob.create({
            data: {
                agentId: max.id,
                orgId,
                status: "completed",
                conversationIds: [],
                analyzedCount: 54,
                result: {
                    topIssues: ["configuração WhatsApp", "importação de contatos", "automações"],
                    avgTurns: 5.2,
                    successRate: 0.81,
                },
                startedAt: daysAgo(20),
                completedAt: daysAgo(15),
            },
        });
    }

    // =========================================================================
    // AGENTE 3 — Luna (Agendamento)
    // =========================================================================
    const lunaFlow = {
        stages: [
            {
                id: "s1",
                name: "Identificação",
                order: 1,
                questionsToAsk: ["Que tipo de reunião?", "Data preferida?"],
                dataToCollect: ["meeting_type", "preferred_date"],
                maxMessages: 3,
            },
            {
                id: "s2",
                name: "Verificação",
                order: 2,
                keyActions: ["check_calendar", "apresentar_slots"],
                dataToCollect: ["duration"],
                maxMessages: 3,
            },
            {
                id: "s3",
                name: "Confirmação",
                order: 3,
                keyActions: ["create_appointment", "enviar_confirmação"],
                maxMessages: 2,
            },
        ],
        objectionPlaybook: [],
        buyingSignals: [
            "confirmo",
            "perfeito",
            "pode marcar",
            "esse horário serve",
        ],
        riskSignals: ["não quero mais", "cancela tudo"],
        metadata: {
            learnedFrom: 32,
            avgSuccessRate: 0.91,
            confidence: 0.93,
        },
    };

    let luna = await prisma.aIAgent.findFirst({
        where: { orgId, name: "Luna" },
        select: { id: true },
    });

    if (!luna) {
        luna = await prisma.aIAgent.create({
            data: {
                name: "Luna",
                description: "Agente de agendamento autônomo para reuniões e demos",
                type: AgentType.SCHEDULER,
                status: AgentStatus.ACTIVE,
                phase: AgentPhase.PRODUCTION,
                isActive: true,
                orgId,
                personality: {
                    name: "Luna",
                    role: "Assistente de Agendamentos",
                    tone: "simpática, eficiente, organizada",
                    style: "confirma detalhes rapidamente e age com autonomia",
                },
                goal: "Agendar reuniões e demos de forma autônoma, encaixando na agenda disponível sem intervenção humana.",
                successCriteria: {
                    primary: "Agendamento criado e confirmado pelo cliente",
                    secondary: "Sem conflitos de agenda",
                    tertiary: "Confirmação enviada em menos de 2 minutos",
                },
                requiredDataPoints: [
                    {
                        field: "meeting_type",
                        question: "Que tipo de reunião você precisa?",
                        required: true,
                    },
                    {
                        field: "preferred_date",
                        question: "Tem preferência de data?",
                        required: true,
                    },
                    {
                        field: "duration",
                        question: "Quanto tempo estima que vai precisar?",
                        required: false,
                    },
                ],
                systemPrompt:
                    "Você é Luna, assistente de agendamentos da Nexus CRM. Seu objetivo é agendar reuniões, demos e onboardings de forma autônoma e eficiente. Seja simpática, organizada e resolva tudo em poucas mensagens.",
                flowTemplate: lunaFlow,
                knowledgeBaseIds: [],
                enabledTools: {
                    check_calendar: { enabled: true },
                    create_appointment: { enabled: true },
                    get_contact_info: { enabled: true },
                    search_knowledge: { enabled: true },
                },
                handoffRules: {
                    always: ["problema complexo de agenda"],
                    afterNTurns: 10,
                },
                maxTurnsBeforeHuman: 10,
                confidenceThreshold: 0.8,
                temperature: 0.3,
                maxTokens: 1024,
                learnedFromCount: 32,
                minimumLearningSample: 20,
                learningCompletedAt: daysAgo(10),
            },
            select: { id: true },
        });
    }

    // AgentFlowVersion — Luna
    const lunaVersion = await prisma.agentFlowVersion.findFirst({
        where: { agentId: luna.id, version: 1 },
        select: { id: true },
    });
    if (!lunaVersion) {
        await prisma.agentFlowVersion.create({
            data: {
                agentId: luna.id,
                version: 1,
                flowTemplate: lunaFlow,
                notes: "Versão gerada por aprendizado de 32 conversas de agendamento",
                approvedBy: carlosUserId,
                approvedAt: daysAgo(8),
                isActive: true,
            },
        });
    }

    // AgentLearningJob — Luna
    const lunaJob = await prisma.agentLearningJob.findFirst({
        where: { agentId: luna.id },
        select: { id: true },
    });
    if (!lunaJob) {
        await prisma.agentLearningJob.create({
            data: {
                agentId: luna.id,
                orgId,
                status: "completed",
                conversationIds: [],
                analyzedCount: 32,
                result: {
                    avgTurns: 3.1,
                    successRate: 0.91,
                    topMeetingTypes: ["demo", "onboarding", "reunião comercial"],
                },
                startedAt: daysAgo(15),
                completedAt: daysAgo(10),
            },
        });
    }

    // =========================================================================
    // PERSIST IDs
    // =========================================================================
    writeSeedIds({
        agents: {
            sofia: sofia.id,
            max: max.id,
            luna: luna.id,
        },
    });

    console.log("✅ S03 — Agents: 3 super agentes ativos com flowTemplate");
}

main()
    .catch((e) => {
        console.error("❌ S03 failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

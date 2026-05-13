/**
 * S07 — Conversations
 * Popula: Conversation, Message, AIAgentSession, AIAgentTurn
 * Idempotente: usa findFirst por externalId ou contactId+channel+orgId
 * Depende: .seed-ids.json (S01-S06)
 */

import {
    PrismaClient,
    ConversationChannel,
    ConversationStatus,
    MessageType,
    MessageDirection,
    SessionStatus,
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
        throw new Error("❌ .seed-ids.json não encontrado. Execute S01-S06 primeiro.");
    }
}

function writeSeedIds(data: Record<string, unknown>): void {
    const existing = readSeedIds();
    fs.writeFileSync(SEED_IDS_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
}

function minutesAgo(n: number): Date {
    return new Date(Date.now() - n * 60 * 1000);
}

function hoursAgo(n: number): Date {
    return new Date(Date.now() - n * 60 * 60 * 1000);
}

function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function upsertConversation(opts: {
    externalId: string;
    channel: ConversationChannel;
    status: ConversationStatus;
    contactId: string;
    orgId: string;
    agentId?: string;
    branchId?: string;
    unreadCount?: number;
    lastMessageAt?: Date;
}): Promise<string> {
    const existing = await prisma.conversation.findFirst({
        where: { externalId: opts.externalId, channel: opts.channel, orgId: opts.orgId },
        select: { id: true },
    });
    if (existing) return existing.id;

    const conv = await prisma.conversation.create({
        data: {
            externalId: opts.externalId,
            channel: opts.channel,
            status: opts.status,
            contactId: opts.contactId,
            orgId: opts.orgId,
            agentId: opts.agentId,
            branchId: opts.branchId,
            unreadCount: opts.unreadCount ?? 0,
            lastMessageAt: opts.lastMessageAt ?? new Date(),
        },
        select: { id: true },
    });
    return conv.id;
}

async function addMessage(opts: {
    conversationId: string;
    content: string;
    type?: MessageType;
    direction: MessageDirection;
    senderId?: string;
    sentAt?: Date;
    mediaUrl?: string;
    metadata?: Record<string, unknown>;
}): Promise<string> {
    const msg = await prisma.message.create({
        data: {
            conversationId: opts.conversationId,
            content: opts.content,
            type: opts.type ?? MessageType.TEXT,
            direction: opts.direction,
            senderId: opts.senderId ?? null,
            sentAt: opts.sentAt ?? new Date(),
            mediaUrl: opts.mediaUrl,
            metadata: opts.metadata ?? {},
        },
        select: { id: true },
    });
    return msg.id;
}

async function main() {
    const raw = readSeedIds() as {
        orgId: string;
        users: Record<string, string>;
        contacts: Record<string, string>;
        agents: { sofia: string; max: string; luna: string };
        branches: { sp: string; rj: string; bh: string };
    };

    const { orgId } = raw;
    const u = raw.users;
    const c = raw.contacts;
    const ag = raw.agents;

    const conversations: Record<string, string> = {};
    const agentSessions: Record<string, string> = {};

    // =========================================================================
    // CONV 1 — Camila / WhatsApp / OPEN — Sofia ativa, intent: buying
    // =========================================================================
    conversations.conv1 = await upsertConversation({
        externalId: "demo-wa-camila-001",
        channel: ConversationChannel.WHATSAPP,
        status: ConversationStatus.BOT,
        contactId: c.camila,
        orgId,
        branchId: raw.branches.sp,
        unreadCount: 2,
        lastMessageAt: minutesAgo(5),
    });

    if (await prisma.message.count({ where: { conversationId: conversations.conv1 } }) === 0) {
        await addMessage({ conversationId: conversations.conv1, content: "Oi! Vi o anúncio de vocês no Instagram. Quero saber mais sobre o sistema.", direction: MessageDirection.INBOUND, sentAt: hoursAgo(2) });
        await addMessage({ conversationId: conversations.conv1, content: "Olá, Camila! 😊 Que ótimo que você viu nosso anúncio! Sou a Sofia, assistente virtual da Nexus. Posso te ajudar a conhecer melhor o nosso CRM. Qual o seu segmento de atuação?", direction: MessageDirection.OUTBOUND, sentAt: hoursAgo(2) });
        await addMessage({ conversationId: conversations.conv1, content: "Tenho uma pequena imobiliária, 3 corretores. Hoje usamos só WhatsApp pra tudo.", direction: MessageDirection.INBOUND, sentAt: minutesAgo(110) });
        await addMessage({ conversationId: conversations.conv1, content: "Perfeito! Imobiliárias com equipe pequena são um dos nossos casos de sucesso. Com o Nexus CRM, seus corretores conseguem centralizar todos os atendimentos, criar funis de venda e automatizar follow-ups. Posso te mostrar como funciona na prática?", direction: MessageDirection.OUTBOUND, sentAt: minutesAgo(108) });
        await addMessage({ conversationId: conversations.conv1, content: "Sim! Quanto custa?", direction: MessageDirection.INBOUND, sentAt: minutesAgo(90) });
        await addMessage({ conversationId: conversations.conv1, content: "Ótima pergunta! Temos planos a partir de R$997/mês para equipes de até 5 usuários. Isso inclui CRM completo, agentes de IA, automações e suporte dedicado. Você teria interesse em uma demonstração ao vivo com nosso time?", direction: MessageDirection.OUTBOUND, sentAt: minutesAgo(89) });
        await addMessage({ conversationId: conversations.conv1, content: "Com certeza! Tem essa semana?", direction: MessageDirection.INBOUND, sentAt: minutesAgo(60) });
        await addMessage({ conversationId: conversations.conv1, content: "Tenho sim! Posso agendar para você com nosso especialista Ricardo. Qual horário funciona melhor: terça às 14h ou quarta às 10h?", direction: MessageDirection.OUTBOUND, sentAt: minutesAgo(58) });
        await addMessage({ conversationId: conversations.conv1, content: "Terça às 14h perfeito.", direction: MessageDirection.INBOUND, sentAt: minutesAgo(10) });
        await addMessage({ conversationId: conversations.conv1, content: "Confirmado! ✅ Terça-feira às 14h com Ricardo Silva. Você vai receber o link da reunião por aqui. Tem mais alguma dúvida antes da demo?", direction: MessageDirection.OUTBOUND, sentAt: minutesAgo(5) });
    }

    if (await prisma.aIAgentSession.count({ where: { conversationId: conversations.conv1 } }) === 0) {
        const session1 = await prisma.aIAgentSession.create({
            data: {
                agentId: ag.sofia,
                conversationId: conversations.conv1,
                orgId,
                intent: "buying",
                intentConfidence: 0.89,
                currentStep: "schedule_demo",
                collectedData: {
                    segment: "imobiliária",
                    team_size: "3 corretores",
                    current_tool: "WhatsApp",
                    pain_point: "centralização de atendimentos",
                    budget_signal: "perguntou sobre preço",
                    next_action: "demo terça 14h com Ricardo",
                },
                pendingQuestions: [],
                planSteps: ["qualify", "present_value", "handle_pricing", "schedule_demo"],
                completedSteps: ["qualify", "present_value", "handle_pricing", "schedule_demo"],
                status: SessionStatus.WAITING_USER,
                turnCount: 5,
                lastActivityAt: minutesAgo(5),
            },
            select: { id: true },
        });
        agentSessions.session1 = session1.id;

        // Turns
        await prisma.aIAgentTurn.createMany({
            data: [
                {
                    sessionId: agentSessions.session1, role: "user",
                    content: "Oi! Vi o anúncio de vocês no Instagram. Quero saber mais sobre o sistema.",
                    tokensUsed: 18, createdAt: hoursAgo(2),
                },
                {
                    sessionId: agentSessions.session1, role: "assistant",
                    content: JSON.stringify({
                        observation: "Lead inbound via Meta Ads. Interesse inicial confirmado.",
                        reasoning: "Devo qualificar o lead identificando segmento e tamanho da equipe antes de apresentar valor.",
                        plan: "1. Perguntar segmento. 2. Apresentar benefícios específicos. 3. Oferecer demo.",
                        toolsCalled: [],
                        response: "Olá, Camila! Sou a Sofia. Qual o seu segmento de atuação?",
                    }),
                    tokensUsed: 145, createdAt: hoursAgo(2),
                },
                {
                    sessionId: agentSessions.session1, role: "user",
                    content: "Tenho uma pequena imobiliária, 3 corretores.",
                    tokensUsed: 12, createdAt: minutesAgo(110),
                },
                {
                    sessionId: agentSessions.session1, role: "assistant",
                    content: JSON.stringify({
                        observation: "Segmento: imobiliária. Equipe pequena (3 pessoas). Perfil Starter.",
                        reasoning: "Caso de uso ideal para Starter. Devo apresentar centralização + automação como valor principal.",
                        plan: "Apresentar proposta de valor. Perguntar se quer ver demo.",
                        toolsCalled: [{ name: "search_knowledge", params: { query: "imobiliária CRM benefícios" } }],
                        response: "Imobiliárias com equipe pequena são um dos nossos casos de sucesso...",
                    }),
                    tokensUsed: 218, createdAt: minutesAgo(108),
                },
                {
                    sessionId: agentSessions.session1, role: "user",
                    content: "Sim! Quanto custa?",
                    tokensUsed: 7, createdAt: minutesAgo(90),
                },
            ],
        });
    } else {
        const sess = await prisma.aIAgentSession.findFirst({ where: { conversationId: conversations.conv1 }, select: { id: true } });
        if (sess) agentSessions.session1 = sess.id;
    }

    // =========================================================================
    // CONV 2 — Diego / WhatsApp / OPEN — reengajamento deal rotting
    // =========================================================================
    conversations.conv2 = await upsertConversation({
        externalId: "demo-wa-diego-001",
        channel: ConversationChannel.WHATSAPP,
        status: ConversationStatus.OPEN,
        contactId: c.diego,
        orgId,
        branchId: raw.branches.rj,
        unreadCount: 0,
        lastMessageAt: hoursAgo(1),
    });

    if (await prisma.message.count({ where: { conversationId: conversations.conv2 } }) === 0) {
        await addMessage({ conversationId: conversations.conv2, content: "Oi Ricardo, ainda estou analisando a proposta de vocês.", direction: MessageDirection.INBOUND, sentAt: daysAgo(6) });
        await addMessage({ conversationId: conversations.conv2, content: "Claro, Diego! Fico à disposição para qualquer dúvida. Você tem prazo para tomar a decisão?", direction: MessageDirection.OUTBOUND, senderId: u.ricardo, sentAt: daysAgo(6) });
        await addMessage({ conversationId: conversations.conv2, content: "Oi Diego! 👋 Sou a Sofia da Nexus. Vi que faz 6 dias desde que enviamos a proposta. Quer que eu esclareça alguma dúvida ou agende uma conversa rápida com o Ricardo?", direction: MessageDirection.OUTBOUND, sentAt: hoursAgo(1) });
    }

    // =========================================================================
    // CONV 3 — Rafael / WhatsApp / OPEN — negociando desconto
    // =========================================================================
    conversations.conv3 = await upsertConversation({
        externalId: "demo-wa-rafael-001",
        channel: ConversationChannel.WHATSAPP,
        status: ConversationStatus.BOT,
        contactId: c.rafael,
        orgId,
        branchId: raw.branches.sp,
        unreadCount: 1,
        lastMessageAt: minutesAgo(30),
    });

    if (await prisma.message.count({ where: { conversationId: conversations.conv3 } }) === 0) {
        await addMessage({ conversationId: conversations.conv3, content: "Fernanda, vi a proposta. R$15.000 está acima do nosso orçamento previsto.", direction: MessageDirection.INBOUND, sentAt: daysAgo(3) });
        await addMessage({ conversationId: conversations.conv3, content: "Rafael, entendo! Posso conversar com o nosso time sobre condições especiais para Enterprise. O que seria um valor viável para vocês?", direction: MessageDirection.OUTBOUND, senderId: u.fernanda, sentAt: daysAgo(3) });
        await addMessage({ conversationId: conversations.conv3, content: "Por volta de R$12.000 caberia no orçamento.", direction: MessageDirection.INBOUND, sentAt: daysAgo(2) });
        await addMessage({ conversationId: conversations.conv3, content: "Vou verificar com a diretoria e te retorno até amanhã. Consigo autorizar desconto de 10% pagando anual, ficaria R$13.500. Faz sentido?", direction: MessageDirection.OUTBOUND, senderId: u.fernanda, sentAt: daysAgo(2) });
        await addMessage({ conversationId: conversations.conv3, content: "Próximo. Consegue chegar nos R$12.000 com algum bônus incluído?", direction: MessageDirection.INBOUND, sentAt: minutesAgo(30) });
        await addMessage({ conversationId: conversations.conv3, content: "Rafael, posso incluir 3 meses de onboarding dedicado (valor R$1.500) sem custo adicional, mantendo R$13.500 anuais. Isso agrega bastante valor para seu time. O que acha?", direction: MessageDirection.OUTBOUND, sentAt: minutesAgo(28) });
    }

    // =========================================================================
    // CONV 4 — Clínica / WhatsApp / OPEN — Max suporte, goalAchieved:true
    // =========================================================================
    conversations.conv4 = await upsertConversation({
        externalId: "demo-wa-clinica-001",
        channel: ConversationChannel.WHATSAPP,
        status: ConversationStatus.OPEN,
        contactId: c.clinica,
        orgId,
        branchId: raw.branches.sp,
        unreadCount: 0,
        lastMessageAt: hoursAgo(3),
    });

    if (await prisma.message.count({ where: { conversationId: conversations.conv4 } }) === 0) {
        await addMessage({ conversationId: conversations.conv4, content: "Olá! Estou com problema para integrar o sistema com o WhatsApp da clínica.", direction: MessageDirection.INBOUND, sentAt: hoursAgo(4) });
        await addMessage({ conversationId: conversations.conv4, content: "Olá! Sou o Max, suporte da Nexus. 🔧 Vou te ajudar com a integração do WhatsApp. Você está usando o WhatsApp Business ou WhatsApp Oficial (API)?", direction: MessageDirection.OUTBOUND, sentAt: hoursAgo(4) });
        await addMessage({ conversationId: conversations.conv4, content: "WhatsApp Business mesmo, o normal.", direction: MessageDirection.INBOUND, sentAt: hoursAgo(3) });
        await addMessage({ conversationId: conversations.conv4, content: "Entendido! Para conectar o WhatsApp Business, você precisa: 1) Ir em Configurações → Integrações → WhatsApp, 2) Clicar em 'Conectar via QR Code', 3) Abrir o WhatsApp no celular → aparelhos conectados → ler o QR. Tente isso e me conta se funcionou!", direction: MessageDirection.OUTBOUND, sentAt: hoursAgo(3) });
        await addMessage({ conversationId: conversations.conv4, content: "Funcionou! Que rápido, obrigada Max!", direction: MessageDirection.INBOUND, sentAt: hoursAgo(3) });
    }

    if (await prisma.aIAgentSession.count({ where: { conversationId: conversations.conv4 } }) === 0) {
        const session4 = await prisma.aIAgentSession.create({
            data: {
                agentId: ag.max,
                conversationId: conversations.conv4,
                orgId,
                intent: "whatsapp_integration_support",
                intentConfidence: 0.97,
                currentStep: "resolved",
                collectedData: {
                    issue: "WhatsApp integration",
                    whatsapp_type: "Business",
                    resolution: "QR Code connection",
                    resolved: true,
                },
                pendingQuestions: [],
                planSteps: ["identify_issue", "identify_whatsapp_type", "provide_steps", "confirm_resolution"],
                completedSteps: ["identify_issue", "identify_whatsapp_type", "provide_steps", "confirm_resolution"],
                status: SessionStatus.ENDED,
                turnCount: 3,
                outcome: "WhatsApp Business conectado com sucesso via QR Code",
                goalAchieved: true,
                endedAt: hoursAgo(3),
                lastActivityAt: hoursAgo(3),
            },
            select: { id: true },
        });
        agentSessions.session4 = session4.id;
    } else {
        const sess = await prisma.aIAgentSession.findFirst({ where: { conversationId: conversations.conv4 }, select: { id: true } });
        if (sess) agentSessions.session4 = sess.id;
    }

    // =========================================================================
    // CONV 5 — Agência / Email / RESOLVED — setup WhatsApp
    // =========================================================================
    conversations.conv5 = await upsertConversation({
        externalId: "demo-email-agencia-001",
        channel: ConversationChannel.EMAIL,
        status: ConversationStatus.RESOLVED,
        contactId: c.agencia,
        orgId,
        branchId: raw.branches.rj,
        unreadCount: 0,
        lastMessageAt: daysAgo(5),
    });

    if (await prisma.message.count({ where: { conversationId: conversations.conv5 } }) === 0) {
        await addMessage({ conversationId: conversations.conv5, content: "Olá equipe Nexus, gostaria de configurar o WhatsApp Oficial (API) para nossa agência. Qual o processo?", direction: MessageDirection.INBOUND, sentAt: daysAgo(7) });
        await addMessage({ conversationId: conversations.conv5, content: "Olá! Para ativar o WhatsApp API Oficial, precisamos: 1) Conta no Meta Business Manager verificada, 2) Número dedicado exclusivo para API, 3) Preencher formulário de ativação. Envio o formulário?", direction: MessageDirection.OUTBOUND, senderId: u.amanda, sentAt: daysAgo(6) });
        await addMessage({ conversationId: conversations.conv5, content: "Sim, pode enviar! Já temos o Meta Business verificado.", direction: MessageDirection.INBOUND, sentAt: daysAgo(6) });
        await addMessage({ conversationId: conversations.conv5, content: "Perfeito! Segue o formulário em anexo. Prazo para ativação após preenchimento: 3-5 dias úteis. Qualquer dúvida, é só chamar!", direction: MessageDirection.OUTBOUND, senderId: u.amanda, sentAt: daysAgo(5) });
        await addMessage({ conversationId: conversations.conv5, content: "Recebemos! Obrigada, Amanda. Preenchemos e enviamos.", direction: MessageDirection.INBOUND, sentAt: daysAgo(5) });
    }

    // =========================================================================
    // CONV 6 — Beatriz / WhatsApp / OPEN — pergunta sobre plano Growth
    // =========================================================================
    conversations.conv6 = await upsertConversation({
        externalId: "demo-wa-beatriz-001",
        channel: ConversationChannel.WHATSAPP,
        status: ConversationStatus.BOT,
        contactId: c.beatriz,
        orgId,
        branchId: raw.branches.bh,
        unreadCount: 1,
        lastMessageAt: hoursAgo(4),
    });

    if (await prisma.message.count({ where: { conversationId: conversations.conv6 } }) === 0) {
        await addMessage({ conversationId: conversations.conv6, content: "Oi! Quero entender melhor o plano Growth. Qual a diferença para o Enterprise?", direction: MessageDirection.INBOUND, sentAt: hoursAgo(5) });
        await addMessage({ conversationId: conversations.conv6, content: "Oi Beatriz! O Growth suporta até 10 usuários e 5 agentes IA. O Enterprise tem usuários ilimitados, agentes customizados, SLA garantido e onboarding dedicado. Para uma equipe de 31-100 pessoas como a sua, o Enterprise se paga facilmente. Quer comparar os planos lado a lado?", direction: MessageDirection.OUTBOUND, sentAt: hoursAgo(4) });
        await addMessage({ conversationId: conversations.conv6, content: "Sim por favor!", direction: MessageDirection.INBOUND, sentAt: hoursAgo(4) });
    }

    // =========================================================================
    // CONV 7 — Marcos / Instagram / OPEN
    // =========================================================================
    conversations.conv7 = await upsertConversation({
        externalId: "demo-ig-marcos-001",
        channel: ConversationChannel.INSTAGRAM,
        status: ConversationStatus.BOT,
        contactId: c.marcos,
        orgId,
        branchId: raw.branches.bh,
        unreadCount: 2,
        lastMessageAt: hoursAgo(6),
    });

    if (await prisma.message.count({ where: { conversationId: conversations.conv7 } }) === 0) {
        await addMessage({ conversationId: conversations.conv7, content: "Vi o post de vocês. Vocês integram com HubSpot para migração de dados?", direction: MessageDirection.INBOUND, sentAt: hoursAgo(7) });
        await addMessage({ conversationId: conversations.conv7, content: "Olá Marcos! Sim, temos integração nativa com HubSpot para migração de contatos, deals e histórico. O processo leva em média 2 dias úteis com apoio do nosso time. Quer saber mais detalhes técnicos?", direction: MessageDirection.OUTBOUND, sentAt: hoursAgo(6) });
        await addMessage({ conversationId: conversations.conv7, content: "Sim! E os dados históricos de conversas também migram?", direction: MessageDirection.INBOUND, sentAt: hoursAgo(6) });
    }

    // =========================================================================
    // CONV 8 — Priscila / WhatsApp / OPEN
    // =========================================================================
    conversations.conv8 = await upsertConversation({
        externalId: "demo-wa-priscila-001",
        channel: ConversationChannel.WHATSAPP,
        status: ConversationStatus.OPEN,
        contactId: c.priscila,
        orgId,
        branchId: raw.branches.sp,
        unreadCount: 0,
        lastMessageAt: daysAgo(1),
    });

    if (await prisma.message.count({ where: { conversationId: conversations.conv8 } }) === 0) {
        await addMessage({ conversationId: conversations.conv8, content: "Boa tarde! Vocês têm plano para consultoria autônoma? Sou consultora solo.", direction: MessageDirection.INBOUND, sentAt: daysAgo(1) });
        await addMessage({ conversationId: conversations.conv8, content: "Boa tarde Priscila! Temos sim — o plano Starter (R$997/mês) é perfeito para profissionais autônomos. Inclui 1 usuário, 2 agentes IA e CRM completo. Quer agendar uma demo rápida de 20 minutos?", direction: MessageDirection.OUTBOUND, sentAt: daysAgo(1) });
        await addMessage({ conversationId: conversations.conv8, content: "Pode ser! Qual link para agendar?", direction: MessageDirection.INBOUND, sentAt: daysAgo(1) });
        await addMessage({ conversationId: conversations.conv8, content: "Ótimo! Vou passar seu contato para nosso time e eles te enviam o link de agendamento em até 1h. 😊", direction: MessageDirection.OUTBOUND, sentAt: daysAgo(1) });
    }

    // =========================================================================
    // CONV 9 — Henrique / WhatsApp / RESOLVED — suporte simples
    // =========================================================================
    conversations.conv9 = await upsertConversation({
        externalId: "demo-wa-henrique-001",
        channel: ConversationChannel.WHATSAPP,
        status: ConversationStatus.RESOLVED,
        contactId: c.henrique,
        orgId,
        branchId: raw.branches.sp,
        unreadCount: 0,
        lastMessageAt: daysAgo(2),
    });

    if (await prisma.message.count({ where: { conversationId: conversations.conv9 } }) === 0) {
        await addMessage({ conversationId: conversations.conv9, content: "Como faço para exportar meus contatos para Excel?", direction: MessageDirection.INBOUND, sentAt: daysAgo(2) });
        await addMessage({ conversationId: conversations.conv9, content: "Fácil! Vá em Contatos → clique no ícone de exportar (canto superior direito) → escolha CSV ou Excel → confirme. O arquivo estará pronto em segundos!", direction: MessageDirection.OUTBOUND, sentAt: daysAgo(2) });
        await addMessage({ conversationId: conversations.conv9, content: "Perfeito! Funcionou. Obrigado!", direction: MessageDirection.INBOUND, sentAt: daysAgo(2) });
    }

    // =========================================================================
    // CONV 10 — Clínica / Email / RESOLVED — nota fiscal
    // =========================================================================
    conversations.conv10 = await upsertConversation({
        externalId: "demo-email-clinica-001",
        channel: ConversationChannel.EMAIL,
        status: ConversationStatus.RESOLVED,
        contactId: c.clinica,
        orgId,
        branchId: raw.branches.sp,
        unreadCount: 0,
        lastMessageAt: daysAgo(4),
    });

    if (await prisma.message.count({ where: { conversationId: conversations.conv10 } }) === 0) {
        await addMessage({ conversationId: conversations.conv10, content: "Olá! Preciso da nota fiscal referente ao pagamento de janeiro para fins de contabilidade.", direction: MessageDirection.INBOUND, sentAt: daysAgo(5) });
        await addMessage({ conversationId: conversations.conv10, content: "Olá! A nota fiscal já está disponível no portal do cliente em Financeiro → Notas Fiscais. Caso não encontre, envio por aqui. CNPJ correto para emissão é 12.345.678/0001-90?", direction: MessageDirection.OUTBOUND, senderId: u.patricia, sentAt: daysAgo(5) });
        await addMessage({ conversationId: conversations.conv10, content: "Sim, esse CNPJ está correto. Encontrei no portal, obrigada Patrícia!", direction: MessageDirection.INBOUND, sentAt: daysAgo(4) });
    }

    // =========================================================================
    // PERSIST IDs
    // =========================================================================
    writeSeedIds({ conversations, agentSessions });

    console.log("✅ S07 — Conversations: 10 convs, ~45 msgs, 2 sessions ativas");
}

main()
    .catch((e) => {
        console.error("❌ S07 failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

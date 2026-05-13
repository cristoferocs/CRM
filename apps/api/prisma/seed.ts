import {
    PrismaClient,
    Plan,
    UserRole,
    ContactSource,
    ContactType,
    ConversationChannel,
    ConversationStatus,
    MessageDirection,
    MessageType,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Starting seed...\n");

    // =========================================================================
    // 1. ORGANIZATION
    // =========================================================================
    const org = await prisma.organization.upsert({
        where: { slug: "demo" },
        update: {},
        create: {
            id: "seed-org-demo",
            name: "Demo CRM",
            slug: "demo",
            plan: Plan.GROWTH,
            isActive: true,
            settings: {
                timezone: "America/Sao_Paulo",
                currency: "BRL",
                language: "pt-BR",
            },
            whiteLabelSettings: {
                platformName: "Demo CRM",
                logoUrl: null,
                faviconUrl: null,
                primaryColor: "#6366f1",
                secondaryColor: "#22c55e",
                accentColor: "#f59e0b",
                loginTagline: "Gerencie seus clientes com inteligência",
                emailFromName: "Demo CRM",
                emailFromAddress: "noreply@democrm.com",
                emailFooter: "© 2026 Demo CRM. Todos os direitos reservados.",
                supportEmail: "suporte@democrm.com",
            },
        },
    });

    console.log(`✅ Organization: ${org.name} (${org.id})`);

    // =========================================================================
    // 2. WHITE LABEL DOMAIN (localhost for local dev)
    // =========================================================================
    await prisma.whiteLabelDomain.upsert({
        where: { domain: "localhost" },
        update: { orgId: org.id, isVerified: true },
        create: { domain: "localhost", orgId: org.id, isVerified: true },
    });
    console.log("✅ WhiteLabelDomain: localhost → Demo CRM");

    // =========================================================================
    // 3. DEPARTMENTS
    // =========================================================================
    const deptVendas = await prisma.department.upsert({
        where: { id: "seed-dept-vendas" },
        update: {},
        create: { id: "seed-dept-vendas", name: "Vendas", orgId: org.id },
    });

    const deptSuporte = await prisma.department.upsert({
        where: { id: "seed-dept-suporte" },
        update: {},
        create: { id: "seed-dept-suporte", name: "Suporte", orgId: org.id },
    });

    console.log(`✅ Departments: ${deptVendas.name}, ${deptSuporte.name}`);

    // =========================================================================
    // 4. USERS
    // =========================================================================
    const adminUser = await prisma.user.upsert({
        where: { firebaseUid: "seed-uid-admin" },
        update: {},
        create: {
            id: "seed-user-admin",
            firebaseUid: "seed-uid-admin",
            email: "admin@demo.com",
            name: "Admin Demo",
            role: UserRole.ADMIN,
            orgId: org.id,
            isActive: true,
        },
    });

    const sellerUser = await prisma.user.upsert({
        where: { firebaseUid: "seed-uid-seller" },
        update: {},
        create: {
            id: "seed-user-seller",
            firebaseUid: "seed-uid-seller",
            email: "vendedor@demo.com",
            name: "Vendedor Demo",
            role: UserRole.SELLER,
            orgId: org.id,
            departmentId: deptVendas.id,
            isActive: true,
        },
    });

    const supportUser = await prisma.user.upsert({
        where: { firebaseUid: "seed-uid-support" },
        update: {},
        create: {
            id: "seed-user-support",
            firebaseUid: "seed-uid-support",
            email: "suporte@demo.com",
            name: "Suporte Demo",
            role: UserRole.SUPPORT,
            orgId: org.id,
            departmentId: deptSuporte.id,
            isActive: true,
        },
    });

    console.log(`✅ Users: ${adminUser.email}, ${sellerUser.email}, ${supportUser.email}`);

    // =========================================================================
    // 5. PIPELINE — "Funil Principal"
    // =========================================================================
    const pipeline = await prisma.pipeline.upsert({
        where: { id: "seed-pipeline-main" },
        update: {},
        create: {
            id: "seed-pipeline-main",
            name: "Funil Principal",
            isDefault: true,
            orgId: org.id,
        },
    });

    const stagesData = [
        { id: "stage-1", name: "Novo Lead", order: 1, probability: 10, isWon: false, isLost: false, color: "#6366f1" },
        { id: "stage-2", name: "Qualificado", order: 2, probability: 30, isWon: false, isLost: false, color: "#8b5cf6" },
        { id: "stage-3", name: "Proposta Enviada", order: 3, probability: 60, isWon: false, isLost: false, color: "#f59e0b" },
        { id: "stage-4", name: "Negociação", order: 4, probability: 80, isWon: false, isLost: false, color: "#f97316" },
        { id: "stage-5", name: "Fechado Ganho", order: 5, probability: 100, isWon: true, isLost: false, color: "#22c55e" },
        { id: "stage-6", name: "Fechado Perdido", order: 6, probability: 0, isWon: false, isLost: true, color: "#ef4444" },
    ];

    for (const s of stagesData) {
        await prisma.pipelineStage.upsert({
            where: { id: s.id },
            update: {},
            create: { ...s, pipelineId: pipeline.id },
        });
    }

    console.log(`✅ Pipeline: ${pipeline.name} (${stagesData.length} stages)`);

    // =========================================================================
    // 6. CONTACTS (10 leads — different sources & UTMs)
    // =========================================================================
    const contactsData = [
        {
            id: "seed-contact-1",
            name: "Ana Rodrigues",
            email: "ana.rodrigues@email.com",
            phone: "+5511999990001",
            type: ContactType.LEAD,
            source: ContactSource.WHATSAPP,
            tags: ["vip", "whatsapp"],
        },
        {
            id: "seed-contact-2",
            name: "Carlos Menezes",
            email: "carlos.menezes@email.com",
            phone: "+5511999990002",
            type: ContactType.LEAD,
            source: ContactSource.INSTAGRAM,
            utmSource: "instagram",
            utmMedium: "social",
            utmCampaign: "summer-2026",
            tags: ["instagram"],
        },
        {
            id: "seed-contact-3",
            name: "Fernanda Lima",
            email: "fernanda.lima@email.com",
            phone: "+5511999990003",
            type: ContactType.CUSTOMER,
            source: ContactSource.EMAIL,
            utmSource: "email",
            utmMedium: "newsletter",
            utmCampaign: "onboarding",
            tags: ["cliente"],
        },
        {
            id: "seed-contact-4",
            name: "Ricardo Alves",
            email: "ricardo.alves@email.com",
            phone: "+5511999990004",
            type: ContactType.LEAD,
            source: ContactSource.ADS,
            utmSource: "google",
            utmMedium: "cpc",
            utmCampaign: "brand-2026",
            adId: "ad-google-001",
            campaignId: "camp-google-001",
            tags: ["google-ads"],
        },
        {
            id: "seed-contact-5",
            name: "Juliana Santos",
            email: "juliana.santos@email.com",
            phone: "+5511999990005",
            type: ContactType.LEAD,
            source: ContactSource.LANDING_PAGE,
            utmSource: "facebook",
            utmMedium: "social",
            utmCampaign: "leads-may",
            tags: ["facebook", "landing-page"],
        },
        {
            id: "seed-contact-6",
            name: "Thiago Oliveira",
            email: "thiago.oliveira@email.com",
            phone: "+5511999990006",
            type: ContactType.LEAD,
            source: ContactSource.FACEBOOK,
            tags: ["facebook"],
        },
        {
            id: "seed-contact-7",
            name: "Beatriz Costa",
            email: "beatriz.costa@email.com",
            phone: "+5511999990007",
            type: ContactType.CUSTOMER,
            source: ContactSource.MANUAL,
            tags: ["cliente", "vip"],
        },
        {
            id: "seed-contact-8",
            name: "Paulo Ferreira",
            email: "paulo.ferreira@email.com",
            phone: "+5511999990008",
            type: ContactType.LEAD,
            source: ContactSource.IMPORT,
            tags: ["importado"],
        },
        {
            id: "seed-contact-9",
            name: "Mariana Souza",
            email: "mariana.souza@email.com",
            phone: "+5511999990009",
            type: ContactType.LEAD,
            source: ContactSource.WHATSAPP,
            utmSource: "whatsapp",
            utmMedium: "referral",
            tags: ["whatsapp", "indicação"],
        },
        {
            id: "seed-contact-10",
            name: "Lucas Nascimento",
            email: "lucas.nascimento@email.com",
            phone: "+5511999990010",
            type: ContactType.LEAD,
            source: ContactSource.ADS,
            utmSource: "tiktok",
            utmMedium: "social",
            utmCampaign: "tiktok-may",
            tags: ["tiktok-ads"],
        },
    ];

    const contacts: { id: string; name: string }[] = [];
    for (const c of contactsData) {
        const contact = await prisma.contact.upsert({
            where: { id: c.id },
            update: {},
            create: { ...c, orgId: org.id, customFields: {}, isActive: true },
        });
        contacts.push({ id: contact.id, name: contact.name });
    }

    console.log(`✅ Contacts: ${contacts.length} contacts created`);

    // =========================================================================
    // 7. DEALS — one per stage (using first 6 contacts)
    // =========================================================================
    const dealsData = [
        { id: "seed-deal-1", stageId: "stage-1", contactIdx: 0, title: "Proposta Ana Rodrigues", value: 1500 },
        { id: "seed-deal-2", stageId: "stage-2", contactIdx: 1, title: "Projeto Carlos Menezes", value: 4200 },
        { id: "seed-deal-3", stageId: "stage-3", contactIdx: 2, title: "Contrato Fernanda Lima", value: 8900 },
        { id: "seed-deal-4", stageId: "stage-4", contactIdx: 3, title: "Negociação Ricardo Alves", value: 15000 },
        { id: "seed-deal-5", stageId: "stage-5", contactIdx: 4, title: "Venda Juliana Santos", value: 3200 },
        { id: "seed-deal-6", stageId: "stage-6", contactIdx: 5, title: "Oportunidade Thiago Oliveira", value: 2100 },
    ];

    for (const d of dealsData) {
        const contact = contacts[d.contactIdx]!;
        const stage = stagesData.find((s) => s.id === d.stageId)!;
        await prisma.deal.upsert({
            where: { id: d.id },
            update: {},
            create: {
                id: d.id,
                title: d.title,
                value: d.value,
                stageId: d.stageId,
                pipelineId: pipeline.id,
                contactId: contact.id,
                ownerId: sellerUser.id,
                orgId: org.id,
                probability: stage.probability,
                isActive: true,
                ...(stage.isWon || stage.isLost ? { closedAt: new Date() } : {}),
            },
        });
    }

    console.log(`✅ Deals: ${dealsData.length} deals created`);

    // =========================================================================
    // 8. CONVERSATIONS (WhatsApp + Email) with messages
    // =========================================================================

    const convWhatsApp = await prisma.conversation.upsert({
        where: { id: "seed-conv-1" },
        update: {},
        create: {
            id: "seed-conv-1",
            channel: ConversationChannel.WHATSAPP,
            status: ConversationStatus.OPEN,
            contactId: "seed-contact-1",
            orgId: org.id,
            agentId: sellerUser.id,
            externalId: "wa-ext-001",
            unreadCount: 2,
            lastMessageAt: new Date(),
        },
    });

    await prisma.message.upsert({
        where: { id: "seed-msg-1" },
        update: {},
        create: {
            id: "seed-msg-1",
            content: "Olá! Gostaria de saber mais sobre os planos.",
            type: MessageType.TEXT,
            direction: MessageDirection.INBOUND,
            conversationId: convWhatsApp.id,
            sentAt: new Date(Date.now() - 3_600_000),
        },
    });

    await prisma.message.upsert({
        where: { id: "seed-msg-2" },
        update: {},
        create: {
            id: "seed-msg-2",
            content: "Claro! Temos opções de R$99 até R$499/mês. Posso te enviar o catálogo?",
            type: MessageType.TEXT,
            direction: MessageDirection.OUTBOUND,
            conversationId: convWhatsApp.id,
            senderId: sellerUser.id,
            sentAt: new Date(Date.now() - 3_000_000),
        },
    });

    await prisma.message.upsert({
        where: { id: "seed-msg-3" },
        update: {},
        create: {
            id: "seed-msg-3",
            content: "Sim, por favor!",
            type: MessageType.TEXT,
            direction: MessageDirection.INBOUND,
            conversationId: convWhatsApp.id,
            sentAt: new Date(Date.now() - 1_800_000),
        },
    });

    const convEmail = await prisma.conversation.upsert({
        where: { id: "seed-conv-2" },
        update: {},
        create: {
            id: "seed-conv-2",
            channel: ConversationChannel.EMAIL,
            status: ConversationStatus.OPEN,
            contactId: "seed-contact-2",
            orgId: org.id,
            agentId: supportUser.id,
            externalId: "email-ext-001",
            unreadCount: 1,
            lastMessageAt: new Date(),
        },
    });

    await prisma.message.upsert({
        where: { id: "seed-msg-4" },
        update: {},
        create: {
            id: "seed-msg-4",
            content: "Preciso de suporte com a integração da API.",
            type: MessageType.TEXT,
            direction: MessageDirection.INBOUND,
            conversationId: convEmail.id,
            sentAt: new Date(Date.now() - 7_200_000),
        },
    });

    console.log("✅ Conversations: 2 conversations (WhatsApp + Email) with messages");

    // =========================================================================
    // 9. AUTOMATIONS
    // =========================================================================
    await prisma.automation.upsert({
        where: { id: "seed-automation-1" },
        update: {},
        create: {
            id: "seed-automation-1",
            name: "Boas-vindas ao novo lead",
            description: "Envia mensagem de boas-vindas via WhatsApp quando um novo contato é criado.",
            isActive: true,
            orgId: org.id,
            trigger: { type: "contact_created" },
            conditions: [],
            actions: [
                {
                    type: "send_whatsapp",
                    message: "Olá, {{ contact.name }}! 👋 Seja bem-vindo(a) ao Demo CRM. Em breve um consultor entrará em contato.",
                },
                {
                    type: "add_tag",
                    tag: "boas-vindas-enviado",
                },
            ],
        },
    });

    await prisma.automation.upsert({
        where: { id: "seed-automation-2" },
        update: {},
        create: {
            id: "seed-automation-2",
            name: "Fechar deal após pagamento",
            description: "Move o deal para 'Fechado Ganho' quando um pagamento é confirmado.",
            isActive: true,
            orgId: org.id,
            trigger: { type: "payment_received" },
            conditions: [],
            actions: [
                {
                    type: "move_pipeline",
                    targetStageId: "stage-5",
                },
                {
                    type: "create_activity",
                    activityType: "NOTE",
                    title: "Pagamento confirmado — deal fechado automaticamente.",
                },
            ],
        },
    });

    console.log("✅ Automations: 2 automations created");

    // =========================================================================
    // 10. KNOWLEDGE BASE
    // =========================================================================
    const knowledgeBase = await prisma.knowledgeBase.upsert({
        where: { id: "seed-kb-faq" },
        update: {},
        create: {
            id: "seed-kb-faq",
            name: "FAQ Suporte",
            description: "Perguntas frequentes sobre produtos e serviços",
            type: "FAQ",
            orgId: org.id,
            isActive: true,
        },
    });

    await prisma.knowledgeDocument.upsert({
        where: { id: "seed-kb-doc-1" },
        update: {},
        create: {
            id: "seed-kb-doc-1",
            title: "Política de Devolução",
            content:
                "Nossa política de devolução permite trocas em até 30 dias corridos da data de compra, " +
                "mediante apresentação de nota fiscal. Produtos com avaria devem ser reportados em até 7 dias.",
            sourceType: "TEXT",
            status: "INDEXED",
            chunkCount: 1,
            knowledgeBaseId: knowledgeBase.id,
            orgId: org.id,
        },
    });

    console.log(`✅ KnowledgeBase: ${knowledgeBase.name}`);

    // =========================================================================
    // 11. AI AGENT
    // =========================================================================
    await prisma.aIAgent.upsert({
        where: { id: "seed-agent-sales" },
        update: {},
        create: {
            id: "seed-agent-sales",
            name: "Assistente de Vendas",
            description: "Agente de IA para qualificação de leads e suporte em vendas",
            type: "SALES",
            status: "ACTIVE",
            provider: "OPENAI",
            model: "gpt-4o",
            systemPrompt:
                "Você é um assistente de vendas especializado. Seu objetivo é entender as necessidades do cliente, " +
                "apresentar as soluções disponíveis e guiá-lo até a próxima etapa do processo comercial. " +
                "Seja sempre cordial, objetivo e empático. Quando não souber a resposta, transfira para um atendente humano.",
            temperature: 0.3,
            maxTokens: 1024,
            knowledgeBaseIds: [knowledgeBase.id],
            orgId: org.id,
            isActive: true,
        },
    });

    console.log("✅ AIAgent: Assistente de Vendas");

    // =========================================================================
    // Done
    // =========================================================================
    console.log("\n🎉 Seed completed successfully!");
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

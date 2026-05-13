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
    PipelineType,
    StageType,
    StageAgentTrigger,
    MovedByType,
    SessionStatus,
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
    // 4.5. AI AGENTS — criados antes dos pipelines (referenciados nas etapas)
    // =========================================================================
    const agentQualification = await prisma.aIAgent.upsert({
        where: { id: "seed-agent-qualification" },
        update: {},
        create: {
            id: "seed-agent-qualification",
            name: "Agente de Qualificação",
            description: "Qualifica novos leads automaticamente ao entrar no funil",
            type: "QUALIFICATION",
            status: "ACTIVE",
            provider: "OPENAI",
            model: "gpt-4o",
            systemPrompt:
                "Você é um agente de qualificação de leads. Ao receber um novo lead, seu objetivo é entender " +
                "o perfil do cliente, identificar a necessidade e verificar se há budget e urgência. " +
                "Colete: nome, empresa, cargo, tamanho da empresa, necessidade principal e prazo para decisão.",
            goal: "Qualificar leads identificando perfil, necessidade, budget e urgência de compra.",
            temperature: 0.2,
            maxTokens: 1024,
            orgId: org.id,
            isActive: true,
        },
    });

    const agentSales = await prisma.aIAgent.upsert({
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
            goal: "Conduzir o lead pelo funil de vendas até o fechamento do negócio.",
            temperature: 0.3,
            maxTokens: 1024,
            orgId: org.id,
            isActive: true,
        },
    });

    console.log(`✅ AI Agents (pre-pipeline): ${agentQualification.name}, ${agentSales.name}`);

    // =========================================================================
    // 5. PIPELINES — 3 pipelines de demonstração
    // =========================================================================

    // ── Pipeline 1: Funil de Vendas Principal (SALES) ──────────────────────
    const pipeline1 = await prisma.pipeline.upsert({
        where: { id: "seed-pipeline-main" },
        update: {},
        create: {
            id: "seed-pipeline-main",
            name: "Funil de Vendas Principal",
            description: "Pipeline principal para gestão de oportunidades comerciais",
            type: PipelineType.SALES,
            isDefault: true,
            color: "#7c5cfc",
            rottingDays: 7,
            orgId: org.id,
        },
    });

    await prisma.pipelineStage.upsert({
        where: { id: "stage-1" },
        update: {},
        create: {
            id: "stage-1",
            pipelineId: pipeline1.id,
            name: "Novo Lead",
            order: 1,
            probability: 10,
            type: StageType.ENTRY,
            color: "#6366f1",
            agentId: agentQualification.id,
            agentTrigger: StageAgentTrigger.AUTO_ENTER,
            agentGoal: "Qualifique o lead: entenda a necessidade, budget e urgência.",
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-2" },
        update: {},
        create: {
            id: "stage-2",
            pipelineId: pipeline1.id,
            name: "Qualificado",
            order: 2,
            probability: 30,
            type: StageType.REGULAR,
            color: "#8b5cf6",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-3" },
        update: {},
        create: {
            id: "stage-3",
            pipelineId: pipeline1.id,
            name: "Proposta Enviada",
            order: 3,
            probability: 60,
            type: StageType.DECISION,
            color: "#f59e0b",
            agentTrigger: StageAgentTrigger.AUTO_ROTTING,
            rottingDays: 5,
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-4" },
        update: {},
        create: {
            id: "stage-4",
            pipelineId: pipeline1.id,
            name: "Negociação",
            order: 4,
            probability: 80,
            type: StageType.DECISION,
            color: "#f97316",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-5" },
        update: {},
        create: {
            id: "stage-5",
            pipelineId: pipeline1.id,
            name: "Fechado Ganho",
            order: 5,
            probability: 100,
            type: StageType.WON,
            color: "#22c55e",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: true,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-6" },
        update: {},
        create: {
            id: "stage-6",
            pipelineId: pipeline1.id,
            name: "Fechado Perdido",
            order: 6,
            probability: 0,
            type: StageType.LOST,
            color: "#ef4444",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: false,
            isLost: true,
        },
    });

    // ── Pipeline 2: Campanha Instagram — Janeiro (CAMPAIGN) ─────────────────
    const pipeline2 = await prisma.pipeline.upsert({
        where: { id: "seed-pipeline-insta" },
        update: {},
        create: {
            id: "seed-pipeline-insta",
            name: "Campanha Instagram — Janeiro",
            description: "Conversão de leads captados por anúncios no Instagram em Janeiro/2026",
            type: PipelineType.CAMPAIGN,
            isDefault: false,
            color: "#e1306c",
            rottingDays: 3,
            orgId: org.id,
        },
    });

    await prisma.pipelineStage.upsert({
        where: { id: "stage-p2-1" },
        update: {},
        create: {
            id: "stage-p2-1",
            pipelineId: pipeline2.id,
            name: "Clicou no Anúncio",
            order: 1,
            probability: 5,
            type: StageType.ENTRY,
            color: "#9b59b6",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-p2-2" },
        update: {},
        create: {
            id: "stage-p2-2",
            pipelineId: pipeline2.id,
            name: "Respondeu DM",
            order: 2,
            probability: 20,
            type: StageType.REGULAR,
            color: "#8b5cf6",
            agentId: agentSales.id,
            agentTrigger: StageAgentTrigger.AUTO_ENTER,
            agentGoal: "Qualifique o lead via DM e confirme o interesse no produto.",
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-p2-3" },
        update: {},
        create: {
            id: "stage-p2-3",
            pipelineId: pipeline2.id,
            name: "Interesse Confirmado",
            order: 3,
            probability: 50,
            type: StageType.REGULAR,
            color: "#f59e0b",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-p2-4" },
        update: {},
        create: {
            id: "stage-p2-4",
            pipelineId: pipeline2.id,
            name: "Proposta",
            order: 4,
            probability: 70,
            type: StageType.DECISION,
            color: "#f97316",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-p2-5" },
        update: {},
        create: {
            id: "stage-p2-5",
            pipelineId: pipeline2.id,
            name: "Convertido",
            order: 5,
            probability: 100,
            type: StageType.WON,
            color: "#22c55e",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: true,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-p2-6" },
        update: {},
        create: {
            id: "stage-p2-6",
            pipelineId: pipeline2.id,
            name: "Descartado",
            order: 6,
            probability: 0,
            type: StageType.LOST,
            color: "#ef4444",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: false,
            isLost: true,
        },
    });

    // ── Pipeline 3: Renovações Q1 (RENEWAL) ─────────────────────────────────
    const pipeline3 = await prisma.pipeline.upsert({
        where: { id: "seed-pipeline-renewal" },
        update: {},
        create: {
            id: "seed-pipeline-renewal",
            name: "Renovações Q1",
            description: "Gestão de renovações de contratos no primeiro trimestre",
            type: PipelineType.RENEWAL,
            isDefault: false,
            color: "#00e5a0",
            rottingDays: 5,
            orgId: org.id,
        },
    });

    await prisma.pipelineStage.upsert({
        where: { id: "stage-p3-1" },
        update: {},
        create: {
            id: "stage-p3-1",
            pipelineId: pipeline3.id,
            name: "Vencendo em 90 dias",
            order: 1,
            probability: 70,
            type: StageType.ENTRY,
            color: "#6366f1",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-p3-2" },
        update: {},
        create: {
            id: "stage-p3-2",
            pipelineId: pipeline3.id,
            name: "Vencendo em 30 dias",
            order: 2,
            probability: 75,
            type: StageType.NURTURING,
            color: "#f59e0b",
            agentTrigger: StageAgentTrigger.AUTO_ROTTING,
            rottingDays: 3,
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-p3-3" },
        update: {},
        create: {
            id: "stage-p3-3",
            pipelineId: pipeline3.id,
            name: "Em Negociação",
            order: 3,
            probability: 85,
            type: StageType.DECISION,
            color: "#f97316",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: false,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-p3-4" },
        update: {},
        create: {
            id: "stage-p3-4",
            pipelineId: pipeline3.id,
            name: "Renovado",
            order: 4,
            probability: 100,
            type: StageType.WON,
            color: "#22c55e",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: true,
            isLost: false,
        },
    });
    await prisma.pipelineStage.upsert({
        where: { id: "stage-p3-5" },
        update: {},
        create: {
            id: "stage-p3-5",
            pipelineId: pipeline3.id,
            name: "Cancelado",
            order: 5,
            probability: 0,
            type: StageType.LOST,
            color: "#ef4444",
            agentTrigger: StageAgentTrigger.MANUAL,
            isWon: false,
            isLost: true,
        },
    });

    console.log(`✅ Pipelines: ${pipeline1.name} | ${pipeline2.name} | ${pipeline3.name} (17 stages)`);

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
    // 7. DEALS — 15 deals distribuídos entre os 3 pipelines
    // =========================================================================
    const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

    // ── Pipeline 1: Funil de Vendas Principal ─────────────────────────────
    await prisma.deal.upsert({
        where: { id: "seed-deal-1" },
        update: { isRotting: false, rottingDays: 0, aiProbability: 35.5 },
        create: {
            id: "seed-deal-1",
            title: "Proposta Ana Rodrigues",
            value: 1500,
            stageId: "stage-2",
            pipelineId: pipeline1.id,
            contactId: "seed-contact-1",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 30,
            aiProbability: 35.5,
            isRotting: false,
            utmSource: "whatsapp",
            stageEnteredAt: ago(18),
            lastActivityAt: ago(1),
            customFields: { empresa: "Studio Rodrigues", cargo: "Sócia", budget: "R$ 5.000/mês" },
            stageHistory: [
                { stageId: "stage-1", stageName: "Novo Lead", enteredAt: ago(20).toISOString(), movedAt: ago(18).toISOString(), daysSpent: 2 },
            ],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-2" },
        update: { isRotting: true, rottingDays: 7, aiProbability: 45.0 },
        create: {
            id: "seed-deal-2",
            title: "Projeto Carlos Menezes",
            value: 4200,
            stageId: "stage-3",
            pipelineId: pipeline1.id,
            contactId: "seed-contact-2",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 60,
            aiProbability: 45.0,
            isRotting: true,
            rottingDays: 7,
            utmSource: "instagram",
            utmCampaign: "summer-2026",
            stageEnteredAt: ago(15),
            lastActivityAt: ago(7),
            customFields: { empresa: "Menezes Consultoria", cargo: "CEO", budget: "R$ 10.000/mês" },
            stageHistory: [
                { stageId: "stage-1", stageName: "Novo Lead", enteredAt: ago(25).toISOString(), movedAt: ago(22).toISOString(), daysSpent: 3 },
                { stageId: "stage-2", stageName: "Qualificado", enteredAt: ago(22).toISOString(), movedAt: ago(15).toISOString(), daysSpent: 7 },
            ],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-3" },
        update: { isRotting: false, aiProbability: 72.5 },
        create: {
            id: "seed-deal-3",
            title: "Contrato Fernanda Lima",
            value: 8900,
            stageId: "stage-4",
            pipelineId: pipeline1.id,
            contactId: "seed-contact-3",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 80,
            aiProbability: 72.5,
            isRotting: false,
            utmSource: "email",
            utmCampaign: "onboarding",
            stageEnteredAt: ago(10),
            lastActivityAt: ago(2),
            customFields: { empresa: "Lima & Associados", cargo: "Diretora", budget: "R$ 20.000/mês" },
            stageHistory: [
                { stageId: "stage-1", stageName: "Novo Lead", enteredAt: ago(30).toISOString(), movedAt: ago(25).toISOString(), daysSpent: 5 },
                { stageId: "stage-3", stageName: "Proposta Enviada", enteredAt: ago(25).toISOString(), movedAt: ago(10).toISOString(), daysSpent: 15 },
            ],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-4" },
        update: { isRotting: true, rottingDays: 10, aiProbability: 38.0 },
        create: {
            id: "seed-deal-4",
            title: "Negociação Ricardo Alves",
            value: 15000,
            stageId: "stage-3",
            pipelineId: pipeline1.id,
            contactId: "seed-contact-4",
            ownerId: adminUser.id,
            orgId: org.id,
            probability: 60,
            aiProbability: 38.0,
            isRotting: true,
            rottingDays: 10,
            utmSource: "google",
            adId: "ad-google-001",
            stageEnteredAt: ago(17),
            lastActivityAt: ago(10),
            customFields: { empresa: "Alves Tech", cargo: "CTO", budget: "R$ 30.000/mês" },
            stageHistory: [
                { stageId: "stage-1", stageName: "Novo Lead", enteredAt: ago(35).toISOString(), movedAt: ago(30).toISOString(), daysSpent: 5 },
                { stageId: "stage-2", stageName: "Qualificado", enteredAt: ago(30).toISOString(), movedAt: ago(17).toISOString(), daysSpent: 13 },
            ],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-5" },
        update: { isRotting: false, aiProbability: 98.2 },
        create: {
            id: "seed-deal-5",
            title: "Venda Juliana Santos",
            value: 3200,
            stageId: "stage-5",
            pipelineId: pipeline1.id,
            contactId: "seed-contact-5",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 100,
            aiProbability: 98.2,
            isRotting: false,
            utmSource: "facebook",
            utmCampaign: "leads-may",
            stageEnteredAt: ago(5),
            lastActivityAt: ago(5),
            closedAt: ago(5),
            customFields: { empresa: "Santos Digital", cargo: "Fundadora", plano: "GROWTH" },
            stageHistory: [
                { stageId: "stage-1", stageName: "Novo Lead", enteredAt: ago(40).toISOString(), movedAt: ago(35).toISOString(), daysSpent: 5 },
                { stageId: "stage-3", stageName: "Proposta Enviada", enteredAt: ago(35).toISOString(), movedAt: ago(5).toISOString(), daysSpent: 30 },
            ],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-6" },
        update: { isRotting: false, activeAgentSessionId: "seed-session-1" },
        create: {
            id: "seed-deal-6",
            title: "Oportunidade Thiago Oliveira",
            value: 2100,
            stageId: "stage-1",
            pipelineId: pipeline1.id,
            contactId: "seed-contact-6",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 10,
            aiProbability: 15.0,
            isRotting: false,
            utmSource: "facebook",
            activeAgentSessionId: "seed-session-1",
            stageEnteredAt: ago(2),
            lastActivityAt: ago(0),
            customFields: { empresa: null, cargo: null },
            stageHistory: [],
            isActive: true,
        },
    });

    // ── Pipeline 2: Campanha Instagram — Janeiro ──────────────────────────
    await prisma.deal.upsert({
        where: { id: "seed-deal-7" },
        update: { isRotting: false, activeAgentSessionId: "seed-session-2" },
        create: {
            id: "seed-deal-7",
            title: "Lead Beatriz Costa — Instagram",
            value: 990,
            stageId: "stage-p2-2",
            pipelineId: pipeline2.id,
            contactId: "seed-contact-7",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 20,
            aiProbability: 28.5,
            isRotting: false,
            utmSource: "instagram",
            utmCampaign: "janeiro-2026",
            activeAgentSessionId: "seed-session-2",
            stageEnteredAt: ago(7),
            lastActivityAt: ago(0),
            customFields: { produto_interesse: "Plano Pro", canal: "Instagram DM" },
            stageHistory: [
                { stageId: "stage-p2-1", stageName: "Clicou no Anúncio", enteredAt: ago(8).toISOString(), movedAt: ago(7).toISOString(), daysSpent: 1 },
            ],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-8" },
        update: { isRotting: true, rottingDays: 5, aiProbability: 42.0 },
        create: {
            id: "seed-deal-8",
            title: "Lead Paulo Ferreira — Instagram",
            value: 1490,
            stageId: "stage-p2-3",
            pipelineId: pipeline2.id,
            contactId: "seed-contact-8",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 50,
            aiProbability: 42.0,
            isRotting: true,
            rottingDays: 5,
            utmSource: "instagram",
            utmCampaign: "janeiro-2026",
            stageEnteredAt: ago(11),
            lastActivityAt: ago(5),
            customFields: { produto_interesse: "Plano Starter", canal: "Instagram DM" },
            stageHistory: [
                { stageId: "stage-p2-1", stageName: "Clicou no Anúncio", enteredAt: ago(12).toISOString(), movedAt: ago(11).toISOString(), daysSpent: 1 },
                { stageId: "stage-p2-2", stageName: "Respondeu DM", enteredAt: ago(11).toISOString(), movedAt: ago(6).toISOString(), daysSpent: 5 },
            ],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-9" },
        update: { isRotting: false },
        create: {
            id: "seed-deal-9",
            title: "Lead Mariana Souza — Instagram",
            value: 990,
            stageId: "stage-p2-1",
            pipelineId: pipeline2.id,
            contactId: "seed-contact-9",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 5,
            isRotting: false,
            utmSource: "instagram",
            utmCampaign: "janeiro-2026",
            stageEnteredAt: ago(3),
            lastActivityAt: ago(3),
            customFields: { ad_criativo: "video-01", canal: "Instagram Feed" },
            stageHistory: [],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-10" },
        update: { isRotting: true, rottingDays: 6, aiProbability: 58.0 },
        create: {
            id: "seed-deal-10",
            title: "Lead Lucas Nascimento — Instagram",
            value: 1990,
            stageId: "stage-p2-4",
            pipelineId: pipeline2.id,
            contactId: "seed-contact-10",
            ownerId: adminUser.id,
            orgId: org.id,
            probability: 70,
            aiProbability: 58.0,
            isRotting: true,
            rottingDays: 6,
            utmSource: "instagram",
            utmCampaign: "janeiro-2026",
            stageEnteredAt: ago(15),
            lastActivityAt: ago(6),
            customFields: { produto_interesse: "Plano Growth", canal: "Instagram Stories" },
            stageHistory: [
                { stageId: "stage-p2-1", stageName: "Clicou no Anúncio", enteredAt: ago(15).toISOString(), movedAt: ago(12).toISOString(), daysSpent: 3 },
                { stageId: "stage-p2-3", stageName: "Interesse Confirmado", enteredAt: ago(12).toISOString(), movedAt: ago(9).toISOString(), daysSpent: 3 },
            ],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-11" },
        update: { isRotting: false, aiProbability: 99.1 },
        create: {
            id: "seed-deal-11",
            title: "Convertida Ana Rodrigues — Instagram",
            value: 1490,
            stageId: "stage-p2-5",
            pipelineId: pipeline2.id,
            contactId: "seed-contact-1",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 100,
            aiProbability: 99.1,
            isRotting: false,
            utmSource: "instagram",
            utmCampaign: "janeiro-2026",
            stageEnteredAt: ago(10),
            lastActivityAt: ago(10),
            closedAt: ago(10),
            customFields: { produto_interesse: "Plano Pro", canal: "Instagram DM" },
            stageHistory: [
                { stageId: "stage-p2-1", stageName: "Clicou no Anúncio", enteredAt: ago(20).toISOString(), movedAt: ago(19).toISOString(), daysSpent: 1 },
                { stageId: "stage-p2-2", stageName: "Respondeu DM", enteredAt: ago(19).toISOString(), movedAt: ago(10).toISOString(), daysSpent: 9 },
            ],
            isActive: true,
        },
    });

    // ── Pipeline 3: Renovações Q1 ──────────────────────────────────────────
    await prisma.deal.upsert({
        where: { id: "seed-deal-12" },
        update: { isRotting: true, rottingDays: 4, aiProbability: 68.0 },
        create: {
            id: "seed-deal-12",
            title: "Renovação Carlos Menezes",
            value: 4200,
            stageId: "stage-p3-2",
            pipelineId: pipeline3.id,
            contactId: "seed-contact-2",
            ownerId: adminUser.id,
            orgId: org.id,
            probability: 75,
            aiProbability: 68.0,
            isRotting: true,
            rottingDays: 4,
            stageEnteredAt: ago(30),
            lastActivityAt: ago(4),
            customFields: { contrato_vencimento: "2026-06-15", tipo_renovacao: "Anual" },
            stageHistory: [
                { stageId: "stage-p3-1", stageName: "Vencendo em 90 dias", enteredAt: ago(60).toISOString(), movedAt: ago(30).toISOString(), daysSpent: 30 },
            ],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-13" },
        update: { isRotting: false, aiProbability: 80.0 },
        create: {
            id: "seed-deal-13",
            title: "Renovação Fernanda Lima",
            value: 8900,
            stageId: "stage-p3-3",
            pipelineId: pipeline3.id,
            contactId: "seed-contact-3",
            ownerId: adminUser.id,
            orgId: org.id,
            probability: 85,
            aiProbability: 80.0,
            isRotting: false,
            stageEnteredAt: ago(20),
            lastActivityAt: ago(3),
            customFields: { contrato_vencimento: "2026-06-01", tipo_renovacao: "Bienal" },
            stageHistory: [
                { stageId: "stage-p3-1", stageName: "Vencendo em 90 dias", enteredAt: ago(80).toISOString(), movedAt: ago(50).toISOString(), daysSpent: 30 },
                { stageId: "stage-p3-2", stageName: "Vencendo em 30 dias", enteredAt: ago(50).toISOString(), movedAt: ago(20).toISOString(), daysSpent: 30 },
            ],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-14" },
        update: { isRotting: false },
        create: {
            id: "seed-deal-14",
            title: "Renovação Beatriz Costa",
            value: 3500,
            stageId: "stage-p3-1",
            pipelineId: pipeline3.id,
            contactId: "seed-contact-7",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 70,
            isRotting: false,
            stageEnteredAt: ago(5),
            lastActivityAt: ago(5),
            customFields: { contrato_vencimento: "2026-07-30", tipo_renovacao: "Anual" },
            stageHistory: [],
            isActive: true,
        },
    });
    await prisma.deal.upsert({
        where: { id: "seed-deal-15" },
        update: { isRotting: false, aiProbability: 97.5 },
        create: {
            id: "seed-deal-15",
            title: "Renovação Juliana Santos",
            value: 3200,
            stageId: "stage-p3-4",
            pipelineId: pipeline3.id,
            contactId: "seed-contact-5",
            ownerId: sellerUser.id,
            orgId: org.id,
            probability: 100,
            aiProbability: 97.5,
            isRotting: false,
            stageEnteredAt: ago(10),
            lastActivityAt: ago(10),
            closedAt: ago(10),
            customFields: { contrato_vencimento: "2027-05-13", tipo_renovacao: "Anual" },
            stageHistory: [
                { stageId: "stage-p3-1", stageName: "Vencendo em 90 dias", enteredAt: ago(45).toISOString(), movedAt: ago(30).toISOString(), daysSpent: 15 },
                { stageId: "stage-p3-3", stageName: "Em Negociação", enteredAt: ago(30).toISOString(), movedAt: ago(10).toISOString(), daysSpent: 20 },
            ],
            isActive: true,
        },
    });

    console.log("✅ Deals: 15 deals criados em 3 pipelines");

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
    // 8.5. CONVERSAS ADICIONAIS + SESSÕES DE AGENTES (deals com agente ativo)
    // =========================================================================
    await prisma.conversation.upsert({
        where: { id: "seed-conv-3" },
        update: {},
        create: {
            id: "seed-conv-3",
            channel: ConversationChannel.WHATSAPP,
            status: ConversationStatus.BOT,
            contactId: "seed-contact-6",
            orgId: org.id,
            agentId: sellerUser.id,
            externalId: "wa-ext-003",
            unreadCount: 0,
            lastMessageAt: new Date(),
        },
    });
    await prisma.conversation.upsert({
        where: { id: "seed-conv-4" },
        update: {},
        create: {
            id: "seed-conv-4",
            channel: ConversationChannel.INSTAGRAM,
            status: ConversationStatus.BOT,
            contactId: "seed-contact-7",
            orgId: org.id,
            agentId: sellerUser.id,
            externalId: "ig-ext-001",
            unreadCount: 2,
            lastMessageAt: new Date(),
        },
    });

    await prisma.aIAgentSession.upsert({
        where: { id: "seed-session-1" },
        update: {},
        create: {
            id: "seed-session-1",
            agentId: agentQualification.id,
            conversationId: "seed-conv-3",
            orgId: org.id,
            status: SessionStatus.ACTIVE,
            intent: "qualificação inicial",
            intentConfidence: 0.82,
            collectedData: { empresa: "não informado", cargo: "não informado" },
            pendingQuestions: ["Qual o nome da sua empresa?", "Qual o seu cargo?"],
            turnCount: 3,
        },
    });
    await prisma.aIAgentSession.upsert({
        where: { id: "seed-session-2" },
        update: {},
        create: {
            id: "seed-session-2",
            agentId: agentSales.id,
            conversationId: "seed-conv-4",
            orgId: org.id,
            status: SessionStatus.WAITING_USER,
            intent: "apresentação de produto",
            intentConfidence: 0.91,
            collectedData: { produto_interesse: "Plano Pro", budget_confirmado: false },
            pendingQuestions: ["Qual é o seu budget mensal?"],
            turnCount: 5,
        },
    });

    console.log("✅ Agent Sessions: seed-session-1 (qualificação), seed-session-2 (vendas)");

    // =========================================================================
    // 8.7. DEAL STAGE MOVEMENTS — histórico realista de movimentos
    // =========================================================================

    // Deal 1: Novo Lead → Qualificado
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-1-1" }, update: {}, create: { id: "seed-mv-1-1", dealId: "seed-deal-1", orgId: org.id, toStageId: "stage-1", toStageName: "Novo Lead", movedBy: MovedByType.AUTOMATION, reason: "Lead capturado via WhatsApp", daysInPreviousStage: 0, createdAt: ago(20) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-1-2" }, update: {}, create: { id: "seed-mv-1-2", dealId: "seed-deal-1", orgId: org.id, fromStageId: "stage-1", fromStageName: "Novo Lead", toStageId: "stage-2", toStageName: "Qualificado", movedBy: MovedByType.AGENT, agentId: agentQualification.id, reason: "Buying signal detectado pelo agente", daysInPreviousStage: 2, createdAt: ago(18) } });

    // Deal 2: Novo Lead → Qualificado → Proposta Enviada (isRotting)
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-2-1" }, update: {}, create: { id: "seed-mv-2-1", dealId: "seed-deal-2", orgId: org.id, toStageId: "stage-1", toStageName: "Novo Lead", movedBy: MovedByType.AUTOMATION, reason: "Lead capturado via Instagram", daysInPreviousStage: 0, createdAt: ago(25) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-2-2" }, update: {}, create: { id: "seed-mv-2-2", dealId: "seed-deal-2", orgId: org.id, fromStageId: "stage-1", fromStageName: "Novo Lead", toStageId: "stage-2", toStageName: "Qualificado", movedBy: MovedByType.HUMAN, userId: sellerUser.id, reason: "Cliente demonstrou interesse", daysInPreviousStage: 3, createdAt: ago(22) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-2-3" }, update: {}, create: { id: "seed-mv-2-3", dealId: "seed-deal-2", orgId: org.id, fromStageId: "stage-2", fromStageName: "Qualificado", toStageId: "stage-3", toStageName: "Proposta Enviada", movedBy: MovedByType.HUMAN, userId: sellerUser.id, reason: "Budget confirmado", daysInPreviousStage: 7, createdAt: ago(15) } });

    // Deal 3: Novo Lead → Proposta → Negociação
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-3-1" }, update: {}, create: { id: "seed-mv-3-1", dealId: "seed-deal-3", orgId: org.id, toStageId: "stage-1", toStageName: "Novo Lead", movedBy: MovedByType.AUTOMATION, reason: "Lead importado via e-mail", daysInPreviousStage: 0, createdAt: ago(30) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-3-2" }, update: {}, create: { id: "seed-mv-3-2", dealId: "seed-deal-3", orgId: org.id, fromStageId: "stage-1", fromStageName: "Novo Lead", toStageId: "stage-3", toStageName: "Proposta Enviada", movedBy: MovedByType.AGENT, agentId: agentQualification.id, reason: "Qualificação concluída — cliente já conhece o produto", daysInPreviousStage: 5, createdAt: ago(25) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-3-3" }, update: {}, create: { id: "seed-mv-3-3", dealId: "seed-deal-3", orgId: org.id, fromStageId: "stage-3", fromStageName: "Proposta Enviada", toStageId: "stage-4", toStageName: "Negociação", movedBy: MovedByType.HUMAN, userId: sellerUser.id, reason: "Cliente solicitou reunião de negociação", daysInPreviousStage: 15, createdAt: ago(10) } });

    // Deal 4: Novo Lead → Qualificado → Proposta Enviada (isRotting)
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-4-1" }, update: {}, create: { id: "seed-mv-4-1", dealId: "seed-deal-4", orgId: org.id, toStageId: "stage-1", toStageName: "Novo Lead", movedBy: MovedByType.AUTOMATION, reason: "Lead via Google Ads", daysInPreviousStage: 0, createdAt: ago(35) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-4-2" }, update: {}, create: { id: "seed-mv-4-2", dealId: "seed-deal-4", orgId: org.id, fromStageId: "stage-1", fromStageName: "Novo Lead", toStageId: "stage-2", toStageName: "Qualificado", movedBy: MovedByType.HUMAN, userId: adminUser.id, reason: "Cliente demonstrou interesse após demo", daysInPreviousStage: 5, createdAt: ago(30) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-4-3" }, update: {}, create: { id: "seed-mv-4-3", dealId: "seed-deal-4", orgId: org.id, fromStageId: "stage-2", fromStageName: "Qualificado", toStageId: "stage-3", toStageName: "Proposta Enviada", movedBy: MovedByType.HUMAN, userId: adminUser.id, reason: "Proposta enviada após aprovação de budget", daysInPreviousStage: 13, createdAt: ago(17) } });

    // Deal 5: Novo Lead → Proposta → Fechado Ganho
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-5-1" }, update: {}, create: { id: "seed-mv-5-1", dealId: "seed-deal-5", orgId: org.id, toStageId: "stage-1", toStageName: "Novo Lead", movedBy: MovedByType.AUTOMATION, reason: "Lead via Facebook Ads", daysInPreviousStage: 0, createdAt: ago(40) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-5-2" }, update: {}, create: { id: "seed-mv-5-2", dealId: "seed-deal-5", orgId: org.id, fromStageId: "stage-1", fromStageName: "Novo Lead", toStageId: "stage-3", toStageName: "Proposta Enviada", movedBy: MovedByType.AGENT, agentId: agentQualification.id, reason: "Buying signal detectado pelo agente", daysInPreviousStage: 5, createdAt: ago(35) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-5-3" }, update: {}, create: { id: "seed-mv-5-3", dealId: "seed-deal-5", orgId: org.id, fromStageId: "stage-3", fromStageName: "Proposta Enviada", toStageId: "stage-5", toStageName: "Fechado Ganho", movedBy: MovedByType.HUMAN, userId: sellerUser.id, reason: "Contrato assinado — deal ganho!", daysInPreviousStage: 30, createdAt: ago(5) } });

    // Deal 6: entrou em Novo Lead (agente ativo)
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-6-1" }, update: {}, create: { id: "seed-mv-6-1", dealId: "seed-deal-6", orgId: org.id, toStageId: "stage-1", toStageName: "Novo Lead", movedBy: MovedByType.AUTOMATION, reason: "Lead capturado via Facebook Ads", daysInPreviousStage: 0, createdAt: ago(2) } });

    // Deal 7: Clicou → Respondeu DM (agente ativo)
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-7-1" }, update: {}, create: { id: "seed-mv-7-1", dealId: "seed-deal-7", orgId: org.id, toStageId: "stage-p2-1", toStageName: "Clicou no Anúncio", movedBy: MovedByType.AUTOMATION, reason: "Clique no anúncio detectado — Instagram Ads", daysInPreviousStage: 0, createdAt: ago(8) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-7-2" }, update: {}, create: { id: "seed-mv-7-2", dealId: "seed-deal-7", orgId: org.id, fromStageId: "stage-p2-1", fromStageName: "Clicou no Anúncio", toStageId: "stage-p2-2", toStageName: "Respondeu DM", movedBy: MovedByType.AUTOMATION, reason: "DM recebida, agente de vendas ativado", daysInPreviousStage: 1, createdAt: ago(7) } });

    // Deal 8: Clicou → DM → Interesse Confirmado (isRotting)
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-8-1" }, update: {}, create: { id: "seed-mv-8-1", dealId: "seed-deal-8", orgId: org.id, toStageId: "stage-p2-1", toStageName: "Clicou no Anúncio", movedBy: MovedByType.AUTOMATION, reason: "Clique no anúncio", daysInPreviousStage: 0, createdAt: ago(12) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-8-2" }, update: {}, create: { id: "seed-mv-8-2", dealId: "seed-deal-8", orgId: org.id, fromStageId: "stage-p2-1", fromStageName: "Clicou no Anúncio", toStageId: "stage-p2-2", toStageName: "Respondeu DM", movedBy: MovedByType.AUTOMATION, reason: "DM recebida", daysInPreviousStage: 1, createdAt: ago(11) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-8-3" }, update: {}, create: { id: "seed-mv-8-3", dealId: "seed-deal-8", orgId: org.id, fromStageId: "stage-p2-2", fromStageName: "Respondeu DM", toStageId: "stage-p2-3", toStageName: "Interesse Confirmado", movedBy: MovedByType.AGENT, agentId: agentSales.id, reason: "Interesse confirmado pelo agente", daysInPreviousStage: 5, createdAt: ago(6) } });

    // Deal 9: entrou em Clicou no Anúncio
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-9-1" }, update: {}, create: { id: "seed-mv-9-1", dealId: "seed-deal-9", orgId: org.id, toStageId: "stage-p2-1", toStageName: "Clicou no Anúncio", movedBy: MovedByType.AUTOMATION, reason: "Clique no anúncio detectado", daysInPreviousStage: 0, createdAt: ago(3) } });

    // Deal 10: Clicou → Interesse → Proposta (isRotting)
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-10-1" }, update: {}, create: { id: "seed-mv-10-1", dealId: "seed-deal-10", orgId: org.id, toStageId: "stage-p2-1", toStageName: "Clicou no Anúncio", movedBy: MovedByType.AUTOMATION, reason: "Clique no anúncio", daysInPreviousStage: 0, createdAt: ago(15) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-10-2" }, update: {}, create: { id: "seed-mv-10-2", dealId: "seed-deal-10", orgId: org.id, fromStageId: "stage-p2-1", fromStageName: "Clicou no Anúncio", toStageId: "stage-p2-3", toStageName: "Interesse Confirmado", movedBy: MovedByType.AGENT, agentId: agentSales.id, reason: "Qualificação rápida — interesse alto", daysInPreviousStage: 3, createdAt: ago(12) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-10-3" }, update: {}, create: { id: "seed-mv-10-3", dealId: "seed-deal-10", orgId: org.id, fromStageId: "stage-p2-3", fromStageName: "Interesse Confirmado", toStageId: "stage-p2-4", toStageName: "Proposta", movedBy: MovedByType.HUMAN, userId: adminUser.id, reason: "Budget confirmado, proposta enviada", daysInPreviousStage: 3, createdAt: ago(9) } });

    // Deal 11: Clicou → DM → Convertido
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-11-1" }, update: {}, create: { id: "seed-mv-11-1", dealId: "seed-deal-11", orgId: org.id, toStageId: "stage-p2-1", toStageName: "Clicou no Anúncio", movedBy: MovedByType.AUTOMATION, reason: "Clique no anúncio", daysInPreviousStage: 0, createdAt: ago(20) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-11-2" }, update: {}, create: { id: "seed-mv-11-2", dealId: "seed-deal-11", orgId: org.id, fromStageId: "stage-p2-1", fromStageName: "Clicou no Anúncio", toStageId: "stage-p2-2", toStageName: "Respondeu DM", movedBy: MovedByType.AUTOMATION, reason: "DM recebida", daysInPreviousStage: 1, createdAt: ago(19) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-11-3" }, update: {}, create: { id: "seed-mv-11-3", dealId: "seed-deal-11", orgId: org.id, fromStageId: "stage-p2-2", fromStageName: "Respondeu DM", toStageId: "stage-p2-5", toStageName: "Convertido", movedBy: MovedByType.AGENT, agentId: agentSales.id, reason: "Compra concluída via DM pelo agente", daysInPreviousStage: 9, createdAt: ago(10) } });

    // Deal 12: 90 dias → 30 dias (isRotting)
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-12-1" }, update: {}, create: { id: "seed-mv-12-1", dealId: "seed-deal-12", orgId: org.id, toStageId: "stage-p3-1", toStageName: "Vencendo em 90 dias", movedBy: MovedByType.SYSTEM, reason: "Contrato detectado como vencendo em 90 dias", daysInPreviousStage: 0, createdAt: ago(60) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-12-2" }, update: {}, create: { id: "seed-mv-12-2", dealId: "seed-deal-12", orgId: org.id, fromStageId: "stage-p3-1", fromStageName: "Vencendo em 90 dias", toStageId: "stage-p3-2", toStageName: "Vencendo em 30 dias", movedBy: MovedByType.SYSTEM, reason: "Alerta automático: vencendo em 30 dias", daysInPreviousStage: 30, createdAt: ago(30) } });

    // Deal 13: 90 → 30 → Em Negociação
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-13-1" }, update: {}, create: { id: "seed-mv-13-1", dealId: "seed-deal-13", orgId: org.id, toStageId: "stage-p3-1", toStageName: "Vencendo em 90 dias", movedBy: MovedByType.SYSTEM, reason: "Contrato detectado como vencendo em 90 dias", daysInPreviousStage: 0, createdAt: ago(80) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-13-2" }, update: {}, create: { id: "seed-mv-13-2", dealId: "seed-deal-13", orgId: org.id, fromStageId: "stage-p3-1", fromStageName: "Vencendo em 90 dias", toStageId: "stage-p3-2", toStageName: "Vencendo em 30 dias", movedBy: MovedByType.SYSTEM, reason: "Alerta automático: vencendo em 30 dias", daysInPreviousStage: 30, createdAt: ago(50) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-13-3" }, update: {}, create: { id: "seed-mv-13-3", dealId: "seed-deal-13", orgId: org.id, fromStageId: "stage-p3-2", fromStageName: "Vencendo em 30 dias", toStageId: "stage-p3-3", toStageName: "Em Negociação", movedBy: MovedByType.HUMAN, userId: adminUser.id, reason: "Cliente aceitou negociar renovação", daysInPreviousStage: 30, createdAt: ago(20) } });

    // Deal 14: entrou em Vencendo em 90 dias
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-14-1" }, update: {}, create: { id: "seed-mv-14-1", dealId: "seed-deal-14", orgId: org.id, toStageId: "stage-p3-1", toStageName: "Vencendo em 90 dias", movedBy: MovedByType.SYSTEM, reason: "Contrato detectado como vencendo em 90 dias", daysInPreviousStage: 0, createdAt: ago(5) } });

    // Deal 15: 90 dias → Em Negociação → Renovado
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-15-1" }, update: {}, create: { id: "seed-mv-15-1", dealId: "seed-deal-15", orgId: org.id, toStageId: "stage-p3-1", toStageName: "Vencendo em 90 dias", movedBy: MovedByType.SYSTEM, reason: "Contrato detectado como vencendo em 90 dias", daysInPreviousStage: 0, createdAt: ago(45) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-15-2" }, update: {}, create: { id: "seed-mv-15-2", dealId: "seed-deal-15", orgId: org.id, fromStageId: "stage-p3-1", fromStageName: "Vencendo em 90 dias", toStageId: "stage-p3-3", toStageName: "Em Negociação", movedBy: MovedByType.AGENT, agentId: agentQualification.id, reason: "Follow-up automático — interesse confirmado", daysInPreviousStage: 15, createdAt: ago(30) } });
    await prisma.dealStageMovement.upsert({ where: { id: "seed-mv-15-3" }, update: {}, create: { id: "seed-mv-15-3", dealId: "seed-deal-15", orgId: org.id, fromStageId: "stage-p3-3", fromStageName: "Em Negociação", toStageId: "stage-p3-4", toStageName: "Renovado", movedBy: MovedByType.HUMAN, userId: adminUser.id, reason: "Renovação assinada com desconto de fidelidade", daysInPreviousStage: 20, createdAt: ago(10) } });

    console.log("✅ Deal Stage Movements: 36 movimentos criados");

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
    // 11. AI AGENTS — vincular knowledge base (KB criada na seção 10)
    // =========================================================================
    await prisma.aIAgent.update({
        where: { id: "seed-agent-sales" },
        data: { knowledgeBaseIds: [knowledgeBase.id] },
    });
    await prisma.aIAgent.update({
        where: { id: "seed-agent-qualification" },
        data: { knowledgeBaseIds: [knowledgeBase.id] },
    });

    console.log("✅ AI Agents: knowledge base vinculada a ambos os agentes");

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

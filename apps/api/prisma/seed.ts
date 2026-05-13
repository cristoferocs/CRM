import { PrismaClient, Plan, UserRole, AIAgentStatus, AIAgentType, AIProvider } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🌱 Starting seed...')

    // ---------------------------------------------------------------------------
    // Organization
    // ---------------------------------------------------------------------------
    const org = await prisma.organization.upsert({
        where: { slug: 'demo' },
        update: {
            whiteLabelSettings: {
                platformName: 'Demo CRM',
                logoUrl: null,
                faviconUrl: null,
                primaryColor: '#5b5bff',
                secondaryColor: '#00e5c0',
                accentColor: '#ff5b8d',
                loginBackground: null,
                loginTagline: 'Gerencie seus clientes com inteligência',
                emailFromName: 'Demo CRM',
                emailFromAddress: 'noreply@democrm.com',
                emailFooter: '© 2026 Demo CRM. Todos os direitos reservados.',
                supportEmail: 'suporte@democrm.com',
                supportWhatsapp: null,
                termsUrl: null,
                privacyUrl: null,
            },
        },
        create: {
            name: 'Demo Organization',
            slug: 'demo',
            plan: Plan.GROWTH,
            isActive: true,
            settings: {
                timezone: 'America/Sao_Paulo',
                currency: 'BRL',
                language: 'pt-BR',
            },
            whiteLabelSettings: {
                platformName: 'Demo CRM',
                logoUrl: null,
                faviconUrl: null,
                primaryColor: '#5b5bff',
                secondaryColor: '#00e5c0',
                accentColor: '#ff5b8d',
                loginBackground: null,
                loginTagline: 'Gerencie seus clientes com inteligência',
                emailFromName: 'Demo CRM',
                emailFromAddress: 'noreply@democrm.com',
                emailFooter: '© 2026 Demo CRM. Todos os direitos reservados.',
                supportEmail: 'suporte@democrm.com',
                supportWhatsapp: null,
                termsUrl: null,
                privacyUrl: null,
            },
        },
    })

    console.log(`✅ Organization: ${org.name} (${org.id})`)

    // ---------------------------------------------------------------------------
    // Branches
    // ---------------------------------------------------------------------------
    const matriz = await prisma.branch.upsert({
        where: { id: 'seed-branch-hq' },
        update: {},
        create: {
            id: 'seed-branch-hq',
            name: 'Matriz — São Paulo',
            code: 'SP-MAT',
            isHeadquarter: true,
            isActive: true,
            orgId: org.id,
        },
    })

    console.log(`✅ Branch (HQ): ${matriz.name} [${matriz.code}]`)

    const filialRJ = await prisma.branch.upsert({
        where: { id: 'seed-branch-rj' },
        update: {},
        create: {
            id: 'seed-branch-rj',
            name: 'Filial — Rio de Janeiro',
            code: 'RJ-01',
            isHeadquarter: false,
            isActive: true,
            orgId: org.id,
        },
    })

    console.log(`✅ Branch: ${filialRJ.name} [${filialRJ.code}]`)

    // ---------------------------------------------------------------------------
    // Super Admin user (sem branchId — vê tudo)
    // ---------------------------------------------------------------------------
    const admin = await prisma.user.upsert({
        where: { firebaseUid: 'seed-superadmin-uid' },
        update: { branchId: null },
        create: {
            firebaseUid: 'seed-superadmin-uid',
            email: 'admin@demo.crm',
            name: 'Super Admin',
            role: UserRole.SUPER_ADMIN,
            orgId: org.id,
            isActive: true,
        },
    })

    console.log(`✅ User: ${admin.name} <${admin.email}> (${admin.role})`)

    // ---------------------------------------------------------------------------
    // Platform-level SUPER_ADMIN (from environment variables — no hardcoded defaults)
    // ---------------------------------------------------------------------------
    const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_SUPER_ADMIN_EMAIL
    const DEFAULT_ADMIN_NAME = process.env.DEFAULT_SUPER_ADMIN_NAME

    if (!DEFAULT_ADMIN_EMAIL || !DEFAULT_ADMIN_NAME) {
        console.warn(
            '⚠️  DEFAULT_SUPER_ADMIN_EMAIL / DEFAULT_SUPER_ADMIN_NAME not set. ' +
            'Skipping default admin provisioning. Add them to your .env file and re-run the seed.'
        )
    } else {
        const existingDefault = await prisma.user.findFirst({
            where: { orgId: org.id, email: DEFAULT_ADMIN_EMAIL },
        })
        const defaultAdmin = existingDefault
            ? await prisma.user.update({
                where: { id: existingDefault.id },
                data: { role: UserRole.SUPER_ADMIN, isActive: true, branchId: null },
            })
            : await prisma.user.create({
                data: {
                    firebaseUid: `default-admin:${org.id}`,
                    email: DEFAULT_ADMIN_EMAIL,
                    name: DEFAULT_ADMIN_NAME,
                    role: UserRole.SUPER_ADMIN,
                    orgId: org.id,
                    isActive: true,
                },
            })

        console.log(`✅ Default SUPER_ADMIN: ${defaultAdmin.name} <${defaultAdmin.email}>`)
        console.log(`   → Dev-login password: $DEFAULT_SUPER_ADMIN_PASSWORD (env var)`)
    }

    // ---------------------------------------------------------------------------
    // Branch Manager — Filial RJ
    // ---------------------------------------------------------------------------
    const vendedor = await prisma.user.upsert({
        where: { firebaseUid: 'seed-branch-manager-rj-uid' },
        update: { branchId: filialRJ.id, role: UserRole.BRANCH_MANAGER },
        create: {
            firebaseUid: 'seed-branch-manager-rj-uid',
            email: 'vendedor@demo.crm',
            name: 'Vendedor RJ',
            role: UserRole.BRANCH_MANAGER,
            orgId: org.id,
            branchId: filialRJ.id,
            isActive: true,
        },
    })

    console.log(`✅ User: ${vendedor.name} <${vendedor.email}> (${vendedor.role}) → branch: ${filialRJ.code}`)

    // ---------------------------------------------------------------------------
    // Default pipeline with 5 stages
    // ---------------------------------------------------------------------------
    const pipeline = await prisma.pipeline.upsert({
        where: { id: 'seed-pipeline-default' },
        update: {},
        create: {
            id: 'seed-pipeline-default',
            name: 'Pipeline Comercial',
            isDefault: true,
            orgId: org.id,
        },
    })

    console.log(`✅ Pipeline: ${pipeline.name}`)

    const stages = [
        { id: 'stage-1', name: 'Novo Lead', order: 1, color: '#94a3b8', probability: 10, isWon: false, isLost: false },
        { id: 'stage-2', name: 'Qualificado', order: 2, color: '#60a5fa', probability: 25, isWon: false, isLost: false },
        { id: 'stage-3', name: 'Proposta', order: 3, color: '#f59e0b', probability: 50, isWon: false, isLost: false },
        { id: 'stage-4', name: 'Negociação', order: 4, color: '#f97316', probability: 75, isWon: false, isLost: false },
        { id: 'stage-5', name: 'Fechado', order: 5, color: '#22c55e', probability: 100, isWon: true, isLost: false },
    ]

    for (const stage of stages) {
        await prisma.pipelineStage.upsert({
            where: { id: stage.id },
            update: {},
            create: {
                ...stage,
                pipelineId: pipeline.id,
            },
        })
        console.log(`  ↳ Stage ${stage.order}: ${stage.name}`)
    }

    // ---------------------------------------------------------------------------
    // White Label domain for local development
    // ---------------------------------------------------------------------------
    await prisma.whiteLabelDomain.upsert({
        where: { domain: 'localhost' },
        update: { orgId: org.id, isVerified: true },
        create: {
            domain: 'localhost',
            orgId: org.id,
            isVerified: true,
        },
    })

    console.log(`✅ WhiteLabelDomain: localhost → ${org.name} (verified)`)

    console.log('\n🎉 Seed completed successfully!')
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })

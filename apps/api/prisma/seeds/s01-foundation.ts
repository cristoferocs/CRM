/**
 * S01 — Foundation
 * Popula: Organization, Branches, Departments, Users
 * Idempotente: usa upsert/findFirst antes de criar
 */

import { PrismaClient, Plan, UserRole } from "@prisma/client";
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
        return {};
    }
}

function writeSeedIds(data: Record<string, unknown>): void {
    const existing = readSeedIds();
    fs.writeFileSync(SEED_IDS_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
    // =========================================================================
    // ORGANIZATION
    // =========================================================================
    const org = await prisma.organization.upsert({
        where: { slug: "nexus-demo" },
        update: {},
        create: {
            name: "Nexus Soluções Digitais",
            slug: "nexus-demo",
            plan: Plan.GROWTH,
            isActive: true,
            settings: {
                timezone: "America/Sao_Paulo",
                language: "pt-BR",
                workingHours: {
                    start: "08:00",
                    end: "18:00",
                    days: [1, 2, 3, 4, 5],
                },
                notifications: {
                    email: true,
                    whatsapp: true,
                    desktop: true,
                },
            },
            whiteLabelSettings: {
                platformName: "Nexus CRM",
                primaryColor: "#7c5cfc",
                secondaryColor: "#00d4ff",
                accentColor: "#00e5a0",
                loginTagline: "Venda mais com inteligência artificial",
                emailFromName: "Nexus CRM",
                emailFromAddress: "noreply@nexuscrm.com.br",
                emailFooter:
                    "© 2025 Nexus Soluções Digitais. Todos os direitos reservados.",
                supportEmail: "suporte@nexuscrm.com.br",
            },
        },
    });

    // =========================================================================
    // BRANCHES
    // =========================================================================
    const branchSP = await prisma.branch.upsert({
        where: { orgId_code: { orgId: org.id, code: "SP-MAT" } },
        update: {},
        create: {
            name: "Matriz — São Paulo",
            code: "SP-MAT",
            isHeadquarter: true,
            address: "Av. Paulista, 1000 — Bela Vista, São Paulo/SP",
            orgId: org.id,
            isActive: true,
        },
    });

    const branchRJ = await prisma.branch.upsert({
        where: { orgId_code: { orgId: org.id, code: "RJ-01" } },
        update: {},
        create: {
            name: "Filial — Rio de Janeiro",
            code: "RJ-01",
            isHeadquarter: false,
            address: "Rua do Ouvidor, 50 — Centro, Rio de Janeiro/RJ",
            orgId: org.id,
            isActive: true,
        },
    });

    const branchBH = await prisma.branch.upsert({
        where: { orgId_code: { orgId: org.id, code: "BH-01" } },
        update: {},
        create: {
            name: "Filial — Belo Horizonte",
            code: "BH-01",
            isHeadquarter: false,
            address: "Av. Afonso Pena, 500 — Centro, Belo Horizonte/MG",
            orgId: org.id,
            isActive: true,
        },
    });

    // =========================================================================
    // DEPARTMENTS
    // =========================================================================
    const deptDefs = [
        { name: "Comercial", description: "Time de vendas e prospecção" },
        { name: "Suporte", description: "Atendimento e pós-venda" },
        { name: "Marketing", description: "Tráfego pago e campanhas" },
        { name: "Financeiro", description: "Cobranças e recebimentos" },
    ];

    const departments: Record<string, string> = {};
    for (const def of deptDefs) {
        const existing = await prisma.department.findFirst({
            where: { orgId: org.id, name: def.name },
        });
        if (existing) {
            departments[def.name.toLowerCase()] = existing.id;
        } else {
            const dept = await prisma.department.create({
                data: { name: def.name, description: def.description, orgId: org.id },
            });
            departments[def.name.toLowerCase()] = dept.id;
        }
    }

    // =========================================================================
    // USERS
    // =========================================================================
    const userDefs: Array<{
        uid: string;
        name: string;
        email: string;
        role: UserRole;
        branchId: string;
        deptKey: string;
    }> = [
            {
                uid: "demo-uid-1",
                name: "Carlos Administrador",
                email: "admin@nexusdemo.com.br",
                role: UserRole.ADMIN,
                branchId: branchSP.id,
                deptKey: "comercial",
            },
            {
                uid: "demo-uid-2",
                name: "Fernanda Gestora",
                email: "fernanda@nexusdemo.com.br",
                role: UserRole.MANAGER,
                branchId: branchSP.id,
                deptKey: "comercial",
            },
            {
                uid: "demo-uid-3",
                name: "Ricardo Vendas SP",
                email: "ricardo@nexusdemo.com.br",
                role: UserRole.SELLER,
                branchId: branchSP.id,
                deptKey: "comercial",
            },
            {
                uid: "demo-uid-4",
                name: "Juliana Vendas SP",
                email: "juliana@nexusdemo.com.br",
                role: UserRole.SELLER,
                branchId: branchSP.id,
                deptKey: "comercial",
            },
            {
                uid: "demo-uid-5",
                name: "Thiago Vendas RJ",
                email: "thiago@nexusdemo.com.br",
                role: UserRole.SELLER,
                branchId: branchRJ.id,
                deptKey: "comercial",
            },
            {
                uid: "demo-uid-6",
                name: "Amanda Suporte",
                email: "amanda@nexusdemo.com.br",
                role: UserRole.SUPPORT,
                branchId: branchSP.id,
                deptKey: "suporte",
            },
            {
                uid: "demo-uid-7",
                name: "Bruno Suporte RJ",
                email: "bruno@nexusdemo.com.br",
                role: UserRole.SUPPORT,
                branchId: branchRJ.id,
                deptKey: "suporte",
            },
            {
                uid: "demo-uid-8",
                name: "Patrícia Marketing",
                email: "patricia@nexusdemo.com.br",
                role: UserRole.VIEWER,
                branchId: branchSP.id,
                deptKey: "marketing",
            },
            {
                uid: "demo-uid-9",
                name: "Lucas Gestor BH",
                email: "lucas@nexusdemo.com.br",
                role: UserRole.BRANCH_MANAGER,
                branchId: branchBH.id,
                deptKey: "comercial",
            },
            {
                uid: "demo-uid-10",
                name: "Sofia Financeiro",
                email: "sofia@nexusdemo.com.br",
                role: UserRole.VIEWER,
                branchId: branchSP.id,
                deptKey: "financeiro",
            },
        ];

    const users: Record<string, string> = {};
    const userKeyMap: Record<string, string> = {
        "demo-uid-1": "admin",
        "demo-uid-2": "fernanda",
        "demo-uid-3": "ricardo",
        "demo-uid-4": "juliana",
        "demo-uid-5": "thiago",
        "demo-uid-6": "amanda",
        "demo-uid-7": "bruno",
        "demo-uid-8": "patricia",
        "demo-uid-9": "lucas",
        "demo-uid-10": "sofia",
    };

    for (const def of userDefs) {
        const user = await prisma.user.upsert({
            where: { firebaseUid: def.uid },
            update: {},
            create: {
                firebaseUid: def.uid,
                name: def.name,
                email: def.email,
                role: def.role,
                orgId: org.id,
                branchId: def.branchId,
                departmentId: departments[def.deptKey],
                isActive: true,
            },
        });
        users[userKeyMap[def.uid]] = user.id;
    }

    // =========================================================================
    // SUPER ADMIN (env) — garante acesso via devLogin no org nexus-demo
    // =========================================================================
    const superAdminEmail = process.env.DEFAULT_SUPER_ADMIN_EMAIL;
    const superAdminName = process.env.DEFAULT_SUPER_ADMIN_NAME ?? "Super Admin";
    if (superAdminEmail) {
        const existing = await prisma.user.findFirst({
            where: { orgId: org.id, email: superAdminEmail },
        });
        if (!existing) {
            await prisma.user.create({
                data: {
                    firebaseUid: `default-admin:${org.id}`,
                    email: superAdminEmail,
                    name: superAdminName,
                    role: UserRole.SUPER_ADMIN,
                    orgId: org.id,
                    branchId: branchSP.id,
                    isActive: true,
                },
            });
        }
    }

    // =========================================================================
    // PERSIST IDs
    // =========================================================================
    writeSeedIds({
        orgId: org.id,
        branches: {
            sp: branchSP.id,
            rj: branchRJ.id,
            bh: branchBH.id,
        },
        departments: {
            comercial: departments["comercial"],
            suporte: departments["suporte"],
            marketing: departments["marketing"],
            financeiro: departments["financeiro"],
        },
        users,
    });

    console.log(
        "✅ S01 — Foundation: org, 3 branches, 4 depts, 10 users"
    );
}

main()
    .catch((e) => {
        console.error("❌ S01 failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

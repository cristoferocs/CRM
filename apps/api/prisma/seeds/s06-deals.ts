/**
 * S06 — Deals
 * Popula: Deal, DealStageMovement
 * Idempotente: usa findFirst por título+pipelineId
 * Depende: .seed-ids.json (S01-S05)
 */

import { PrismaClient, MovedByType } from "@prisma/client";
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
        throw new Error("❌ .seed-ids.json não encontrado. Execute S01-S05 primeiro.");
    }
}

function writeSeedIds(data: Record<string, unknown>): void {
    const existing = readSeedIds();
    fs.writeFileSync(SEED_IDS_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
}

function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function hoursAgo(n: number): Date {
    return new Date(Date.now() - n * 60 * 60 * 1000);
}

function minutesAgo(n: number): Date {
    return new Date(Date.now() - n * 60 * 1000);
}

interface MovementOpts {
    dealId: string;
    orgId: string;
    fromStageId: string | null;
    fromStageName: string | null;
    toStageId: string;
    toStageName: string;
    movedBy: MovedByType;
    userId?: string;
    agentId?: string;
    reason?: string;
    dataCollected?: Record<string, unknown>;
    createdAt: Date;
}

async function createMovement(opts: MovementOpts): Promise<void> {
    await prisma.dealStageMovement.create({
        data: {
            dealId: opts.dealId,
            orgId: opts.orgId,
            fromStageId: opts.fromStageId,
            fromStageName: opts.fromStageName,
            toStageId: opts.toStageId,
            toStageName: opts.toStageName,
            movedBy: opts.movedBy,
            userId: opts.userId,
            agentId: opts.agentId,
            reason: opts.reason,
            dataCollected: opts.dataCollected,
            createdAt: opts.createdAt,
        },
    });
}

async function upsertDeal(opts: {
    title: string;
    pipelineId: string;
    stageId: string;
    contactId: string;
    ownerId: string;
    orgId: string;
    branchId?: string;
    value: number;
    probability?: number;
    aiProbability?: number;
    isRotting?: boolean;
    rottingDays?: number;
    lastActivityAt?: Date;
    stageEnteredAt?: Date;
    closedAt?: Date;
    closedReason?: string;
    customFields?: Record<string, unknown>;
    utmCampaign?: string;
    utmSource?: string;
    adId?: string;
}): Promise<string> {
    const existing = await prisma.deal.findFirst({
        where: { pipelineId: opts.pipelineId, title: opts.title },
        select: { id: true },
    });
    if (existing) return existing.id;

    const d = await prisma.deal.create({
        data: {
            title: opts.title,
            pipelineId: opts.pipelineId,
            stageId: opts.stageId,
            contactId: opts.contactId,
            ownerId: opts.ownerId,
            orgId: opts.orgId,
            branchId: opts.branchId,
            value: opts.value,
            probability: opts.probability ?? 0,
            aiProbability: opts.aiProbability,
            isRotting: opts.isRotting ?? false,
            rottingDays: opts.rottingDays ?? 0,
            lastActivityAt: opts.lastActivityAt ?? new Date(),
            stageEnteredAt: opts.stageEnteredAt ?? new Date(),
            closedAt: opts.closedAt,
            closedReason: opts.closedReason,
            customFields: opts.customFields ?? {},
            utmCampaign: opts.utmCampaign,
            utmSource: opts.utmSource,
            adId: opts.adId,
            isActive: true,
        },
        select: { id: true },
    });
    return d.id;
}

async function main() {
    const raw = readSeedIds() as {
        orgId: string;
        users: Record<string, string>;
        contacts: Record<string, string>;
        pipelines: { main: string; campaign: string; renewal: string };
        stages: {
            main: Record<string, string>;
            campaign: Record<string, string>;
            renewal: Record<string, string>;
        };
        agents: { sofia: string };
        branches: { sp: string; rj: string; bh: string };
    };

    const { orgId } = raw;
    const u = raw.users;
    const c = raw.contacts;
    const s = raw.stages;
    const sofiaId = raw.agents.sofia;

    const deals: Record<string, string> = {};

    // =========================================================================
    // PIPELINE 1 — Funil Principal de Vendas
    // =========================================================================
    const p1 = raw.pipelines.main;
    const sm = s.main;

    // --- Stage: Novo Lead
    deals.deal1 = await upsertDeal({
        title: "Camila Rodrigues — Starter",
        pipelineId: p1, stageId: sm.newLead, contactId: c.camila,
        ownerId: u.ricardo, orgId, branchId: raw.branches.sp,
        value: 997, stageEnteredAt: hoursAgo(2), lastActivityAt: hoursAgo(1),
        utmSource: "facebook", utmCampaign: "campanha-meta-jan-2025",
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal1 } }) === 0) {
        await createMovement({
            dealId: deals.deal1, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, reason: "Deal criado via Meta Ads", createdAt: hoursAgo(2)
        });
    }

    deals.deal2 = await upsertDeal({
        title: "Felipe Santos — Growth",
        pipelineId: p1, stageId: sm.newLead, contactId: c.felipe,
        ownerId: u.juliana, orgId, branchId: raw.branches.rj,
        value: 2497, isRotting: true, rottingDays: 4, lastActivityAt: daysAgo(4),
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal2 } }) === 0) {
        await createMovement({
            dealId: deals.deal2, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, reason: "Deal criado", createdAt: daysAgo(4)
        });
    }

    deals.deal3 = await upsertDeal({
        title: "Isabela Martins — Growth",
        pipelineId: p1, stageId: sm.newLead, contactId: c.isabela,
        ownerId: u.thiago, orgId, branchId: raw.branches.bh,
        value: 2497,
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal3 } }) === 0) {
        await createMovement({
            dealId: deals.deal3, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, reason: "Deal criado", createdAt: daysAgo(1)
        });
    }

    deals.deal4 = await upsertDeal({
        title: "Gabriel Oliveira — Enterprise",
        pipelineId: p1, stageId: sm.newLead, contactId: c.gabriel,
        ownerId: u.ricardo, orgId, branchId: raw.branches.sp,
        value: 8000,
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal4 } }) === 0) {
        await createMovement({
            dealId: deals.deal4, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, reason: "Deal criado", createdAt: hoursAgo(3)
        });
    }

    // --- Stage: Qualificado
    deals.deal5 = await upsertDeal({
        title: "Natália Costa — Starter",
        pipelineId: p1, stageId: sm.qualified, contactId: c.natalia,
        ownerId: u.juliana, orgId, branchId: raw.branches.rj,
        value: 997, probability: 35, aiProbability: 0.38,
        customFields: { company_size: "5-10", main_pain: "Perco leads" },
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal5 } }) === 0) {
        await createMovement({
            dealId: deals.deal5, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, reason: "Deal criado", createdAt: daysAgo(3)
        });
        await createMovement({
            dealId: deals.deal5, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.AGENT, agentId: sofiaId,
            reason: "Lead qualificado pela Sofia", createdAt: daysAgo(1)
        });
    }

    deals.deal6 = await upsertDeal({
        title: "Pedro Almeida — Growth",
        pipelineId: p1, stageId: sm.qualified, contactId: c.pedro,
        ownerId: u.ricardo, orgId, branchId: raw.branches.bh,
        value: 2497, probability: 42, aiProbability: 0.45,
        customFields: { company_size: "20-50", current_tool: "planilha", decision_maker: true },
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal6 } }) === 0) {
        await createMovement({
            dealId: deals.deal6, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, reason: "Deal criado", createdAt: daysAgo(5)
        });
        await createMovement({
            dealId: deals.deal6, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.contacted, toStageName: "Contato Feito",
            movedBy: MovedByType.HUMAN, userId: u.ricardo,
            reason: "Primeiro contato realizado", createdAt: daysAgo(4)
        });
        await createMovement({
            dealId: deals.deal6, orgId, fromStageId: sm.contacted, fromStageName: "Contato Feito",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.AGENT, agentId: sofiaId,
            reason: "Qualificação completa", createdAt: daysAgo(2)
        });
    }

    deals.deal7 = await upsertDeal({
        title: "Letícia Ferreira — Enterprise",
        pipelineId: p1, stageId: sm.qualified, contactId: c.leticia,
        ownerId: u.fernanda, orgId, branchId: raw.branches.sp,
        value: 12000, probability: 38, aiProbability: 0.31,
        customFields: { company_size: "100+", current_tool: "Salesforce", decision_maker: false },
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal7 } }) === 0) {
        await createMovement({
            dealId: deals.deal7, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, reason: "Deal criado", createdAt: daysAgo(7)
        });
        await createMovement({
            dealId: deals.deal7, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.HUMAN, userId: u.fernanda,
            reason: "Qualificado manualmente após reunião inicial", createdAt: daysAgo(3)
        });
    }

    // --- Stage: Proposta Enviada
    deals.deal8 = await upsertDeal({
        title: "Diego Lima — Growth",
        pipelineId: p1, stageId: sm.proposal, contactId: c.diego,
        ownerId: u.ricardo, orgId, branchId: raw.branches.rj,
        value: 2497, isRotting: true, rottingDays: 6,
        probability: 55, aiProbability: 0.52,
        lastActivityAt: daysAgo(6),
        customFields: { company_size: "11-30", current_tool: "planilha", decision_maker: true },
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal8 } }) === 0) {
        await createMovement({
            dealId: deals.deal8, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(12)
        });
        await createMovement({
            dealId: deals.deal8, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.contacted, toStageName: "Contato Feito",
            movedBy: MovedByType.HUMAN, userId: u.ricardo, createdAt: daysAgo(10)
        });
        await createMovement({
            dealId: deals.deal8, orgId, fromStageId: sm.contacted, fromStageName: "Contato Feito",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(8)
        });
        await createMovement({
            dealId: deals.deal8, orgId, fromStageId: sm.qualified, fromStageName: "Qualificado",
            toStageId: sm.proposal, toStageName: "Proposta Enviada",
            movedBy: MovedByType.HUMAN, userId: u.ricardo,
            reason: "Proposta enviada por email", createdAt: daysAgo(6)
        });
    }

    deals.deal9 = await upsertDeal({
        title: "Mariana Sousa — Starter",
        pipelineId: p1, stageId: sm.proposal, contactId: c.mariana,
        ownerId: u.juliana, orgId, branchId: raw.branches.bh,
        value: 997, probability: 65, aiProbability: 0.71,
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal9 } }) === 0) {
        await createMovement({
            dealId: deals.deal9, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(10)
        });
        await createMovement({
            dealId: deals.deal9, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(7)
        });
        await createMovement({
            dealId: deals.deal9, orgId, fromStageId: sm.qualified, fromStageName: "Qualificado",
            toStageId: sm.proposal, toStageName: "Proposta Enviada",
            movedBy: MovedByType.HUMAN, userId: u.juliana, createdAt: daysAgo(4)
        });
    }

    deals.deal10 = await upsertDeal({
        title: "Rafael Carvalho — Enterprise",
        pipelineId: p1, stageId: sm.proposal, contactId: c.rafael,
        ownerId: u.fernanda, orgId, branchId: raw.branches.sp,
        value: 15000, probability: 60, aiProbability: 0.58,
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal10 } }) === 0) {
        await createMovement({
            dealId: deals.deal10, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(9)
        });
        await createMovement({
            dealId: deals.deal10, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(6)
        });
        await createMovement({
            dealId: deals.deal10, orgId, fromStageId: sm.qualified, fromStageName: "Qualificado",
            toStageId: sm.proposal, toStageName: "Proposta Enviada",
            movedBy: MovedByType.HUMAN, userId: u.fernanda,
            reason: "Proposta Enterprise enviada", createdAt: daysAgo(3)
        });
    }

    // --- Stage: Negociação
    deals.deal11 = await upsertDeal({
        title: "Beatriz Cavalcante — Growth",
        pipelineId: p1, stageId: sm.negotiation, contactId: c.beatriz,
        ownerId: u.ricardo, orgId, branchId: raw.branches.bh,
        value: 4994, probability: 82, aiProbability: 0.85,
        customFields: { company_size: "31-100", current_tool: "Pipedrive", decision_maker: true },
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal11 } }) === 0) {
        await createMovement({
            dealId: deals.deal11, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(15)
        });
        await createMovement({
            dealId: deals.deal11, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.contacted, toStageName: "Contato Feito",
            movedBy: MovedByType.HUMAN, userId: u.ricardo, createdAt: daysAgo(13)
        });
        await createMovement({
            dealId: deals.deal11, orgId, fromStageId: sm.contacted, fromStageName: "Contato Feito",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(10)
        });
        await createMovement({
            dealId: deals.deal11, orgId, fromStageId: sm.qualified, fromStageName: "Qualificado",
            toStageId: sm.negotiation, toStageName: "Negociação",
            movedBy: MovedByType.HUMAN, userId: u.fernanda,
            reason: "Cliente solicitou reunião de negociação", createdAt: daysAgo(3)
        });
    }

    deals.deal12 = await upsertDeal({
        title: "Marcos Vieira — Enterprise",
        pipelineId: p1, stageId: sm.negotiation, contactId: c.marcos,
        ownerId: u.fernanda, orgId, branchId: raw.branches.bh,
        value: 24000, probability: 79, aiProbability: 0.76,
        customFields: { company_size: "11-30", current_tool: "HubSpot gratuito", decision_maker: true },
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal12 } }) === 0) {
        await createMovement({
            dealId: deals.deal12, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(18)
        });
        await createMovement({
            dealId: deals.deal12, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.contacted, toStageName: "Contato Feito",
            movedBy: MovedByType.HUMAN, userId: u.fernanda, createdAt: daysAgo(14)
        });
        await createMovement({
            dealId: deals.deal12, orgId, fromStageId: sm.contacted, fromStageName: "Contato Feito",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(10)
        });
        await createMovement({
            dealId: deals.deal12, orgId, fromStageId: sm.qualified, fromStageName: "Qualificado",
            toStageId: sm.negotiation, toStageName: "Negociação",
            movedBy: MovedByType.HUMAN, userId: u.fernanda,
            reason: "Proposta Enterprise aceita, em negociação de condições", createdAt: daysAgo(4)
        });
    }

    // --- Stage: Fechado Ganho
    deals.deal13 = await upsertDeal({
        title: "Clínica Saúde Plena — Starter",
        pipelineId: p1, stageId: sm.won, contactId: c.clinica,
        ownerId: u.juliana, orgId, branchId: raw.branches.sp,
        value: 997, probability: 100, closedAt: daysAgo(5),
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal13 } }) === 0) {
        await createMovement({
            dealId: deals.deal13, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(20)
        });
        await createMovement({
            dealId: deals.deal13, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.contacted, toStageName: "Contato Feito",
            movedBy: MovedByType.HUMAN, userId: u.juliana, createdAt: daysAgo(18)
        });
        await createMovement({
            dealId: deals.deal13, orgId, fromStageId: sm.contacted, fromStageName: "Contato Feito",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(15)
        });
        await createMovement({
            dealId: deals.deal13, orgId, fromStageId: sm.qualified, fromStageName: "Qualificado",
            toStageId: sm.proposal, toStageName: "Proposta Enviada",
            movedBy: MovedByType.HUMAN, userId: u.juliana, createdAt: daysAgo(12)
        });
        await createMovement({
            dealId: deals.deal13, orgId, fromStageId: sm.proposal, fromStageName: "Proposta Enviada",
            toStageId: sm.won, toStageName: "Fechado Ganho",
            movedBy: MovedByType.AGENT, agentId: sofiaId,
            reason: "Buying signal detectado: cliente perguntou sobre onboarding",
            dataCollected: { decision: "sim", payment_method: "cartão", plan: "starter" },
            createdAt: daysAgo(5)
        });
    }

    deals.deal14 = await upsertDeal({
        title: "Agência Digital Vibe — Growth",
        pipelineId: p1, stageId: sm.won, contactId: c.agencia,
        ownerId: u.ricardo, orgId, branchId: raw.branches.rj,
        value: 2497, probability: 100, closedAt: daysAgo(12),
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal14 } }) === 0) {
        await createMovement({
            dealId: deals.deal14, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(30)
        });
        await createMovement({
            dealId: deals.deal14, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(25)
        });
        await createMovement({
            dealId: deals.deal14, orgId, fromStageId: sm.qualified, fromStageName: "Qualificado",
            toStageId: sm.proposal, toStageName: "Proposta Enviada",
            movedBy: MovedByType.HUMAN, userId: u.ricardo, createdAt: daysAgo(18)
        });
        await createMovement({
            dealId: deals.deal14, orgId, fromStageId: sm.proposal, fromStageName: "Proposta Enviada",
            toStageId: sm.negotiation, toStageName: "Negociação",
            movedBy: MovedByType.HUMAN, userId: u.ricardo, createdAt: daysAgo(15)
        });
        await createMovement({
            dealId: deals.deal14, orgId, fromStageId: sm.negotiation, fromStageName: "Negociação",
            toStageId: sm.won, toStageName: "Fechado Ganho",
            movedBy: MovedByType.AGENT, agentId: sofiaId,
            reason: "Pagamento confirmado via Stripe", createdAt: daysAgo(12)
        });
    }

    // --- Stage: Fechado Perdido
    deals.deal15 = await upsertDeal({
        title: "Startup Beta — Growth",
        pipelineId: p1, stageId: sm.lost, contactId: c.leticia,
        ownerId: u.thiago, orgId, branchId: raw.branches.rj,
        value: 2497, probability: 0, closedAt: daysAgo(8),
        closedReason: "Escolheu concorrente por preço",
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal15 } }) === 0) {
        await createMovement({
            dealId: deals.deal15, orgId, fromStageId: null, fromStageName: null,
            toStageId: sm.newLead, toStageName: "Novo Lead",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(20)
        });
        await createMovement({
            dealId: deals.deal15, orgId, fromStageId: sm.newLead, fromStageName: "Novo Lead",
            toStageId: sm.qualified, toStageName: "Qualificado",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(15)
        });
        await createMovement({
            dealId: deals.deal15, orgId, fromStageId: sm.qualified, fromStageName: "Qualificado",
            toStageId: sm.proposal, toStageName: "Proposta Enviada",
            movedBy: MovedByType.HUMAN, userId: u.thiago, createdAt: daysAgo(12)
        });
        await createMovement({
            dealId: deals.deal15, orgId, fromStageId: sm.proposal, fromStageName: "Proposta Enviada",
            toStageId: sm.lost, toStageName: "Fechado Perdido",
            movedBy: MovedByType.HUMAN, userId: u.thiago,
            reason: "Cliente fechou com Pipedrive — preço foi decisivo", createdAt: daysAgo(8)
        });
    }

    // =========================================================================
    // PIPELINE 2 — Campanha Meta Ads (6 deals)
    // =========================================================================
    const p2 = raw.pipelines.campaign;
    const sc = s.campaign;

    deals.deal16 = await upsertDeal({
        title: "Camila Rodrigues — Campanha Jan",
        pipelineId: p2, stageId: sc.clicked, contactId: c.camila,
        ownerId: u.ricardo, orgId, value: 997,
        utmSource: "facebook", utmCampaign: "campanha-meta-jan-2025",
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal16 } }) === 0) {
        await createMovement({
            dealId: deals.deal16, orgId, fromStageId: null, fromStageName: null,
            toStageId: sc.clicked, toStageName: "Clicou no Anúncio",
            movedBy: MovedByType.SYSTEM, createdAt: hoursAgo(2)
        });
    }

    deals.deal17 = await upsertDeal({
        title: "Natália Costa — Campanha Jan",
        pipelineId: p2, stageId: sc.firstContact, contactId: c.natalia,
        ownerId: u.juliana, orgId, value: 997,
        utmSource: "facebook", utmCampaign: "campanha-meta-jan-2025",
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal17 } }) === 0) {
        await createMovement({
            dealId: deals.deal17, orgId, fromStageId: null, fromStageName: null,
            toStageId: sc.clicked, toStageName: "Clicou no Anúncio",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(2)
        });
        await createMovement({
            dealId: deals.deal17, orgId, fromStageId: sc.clicked, fromStageName: "Clicou no Anúncio",
            toStageId: sc.firstContact, toStageName: "Primeiro Contato",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(1)
        });
    }

    deals.deal18 = await upsertDeal({
        title: "Pedro Almeida — Campanha Jan",
        pipelineId: p2, stageId: sc.interested, contactId: c.pedro,
        ownerId: u.ricardo, orgId, value: 2497,
        utmSource: "facebook", utmCampaign: "campanha-meta-jan-2025",
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal18 } }) === 0) {
        await createMovement({
            dealId: deals.deal18, orgId, fromStageId: null, fromStageName: null,
            toStageId: sc.clicked, toStageName: "Clicou no Anúncio",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(4)
        });
        await createMovement({
            dealId: deals.deal18, orgId, fromStageId: sc.clicked, fromStageName: "Clicou no Anúncio",
            toStageId: sc.interested, toStageName: "Interesse Confirmado",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(3)
        });
    }

    deals.deal19 = await upsertDeal({
        title: "Beatriz Cavalcante — Campanha Jan",
        pipelineId: p2, stageId: sc.checkout, contactId: c.beatriz,
        ownerId: u.juliana, orgId, value: 2497,
        utmSource: "facebook", utmCampaign: "campanha-meta-jan-2025",
        probability: 70,
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal19 } }) === 0) {
        await createMovement({
            dealId: deals.deal19, orgId, fromStageId: null, fromStageName: null,
            toStageId: sc.clicked, toStageName: "Clicou no Anúncio",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(5)
        });
        await createMovement({
            dealId: deals.deal19, orgId, fromStageId: sc.clicked, fromStageName: "Clicou no Anúncio",
            toStageId: sc.checkout, toStageName: "Checkout Iniciado",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(2)
        });
    }

    deals.deal20 = await upsertDeal({
        title: "Loja Eletrônicos Max — Campanha Jan",
        pipelineId: p2, stageId: sc.converted, contactId: c.loja,
        ownerId: u.ricardo, orgId, value: 997,
        probability: 100, closedAt: daysAgo(3),
        utmSource: "facebook", utmCampaign: "campanha-meta-jan-2025",
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal20 } }) === 0) {
        await createMovement({
            dealId: deals.deal20, orgId, fromStageId: null, fromStageName: null,
            toStageId: sc.clicked, toStageName: "Clicou no Anúncio",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(8)
        });
        await createMovement({
            dealId: deals.deal20, orgId, fromStageId: sc.clicked, fromStageName: "Clicou no Anúncio",
            toStageId: sc.converted, toStageName: "Convertido",
            movedBy: MovedByType.AGENT, agentId: sofiaId,
            reason: "Checkout finalizado", createdAt: daysAgo(3)
        });
    }

    deals.deal21 = await upsertDeal({
        title: "Studio Fitness Pro — Campanha Jan",
        pipelineId: p2, stageId: sc.discarded, contactId: c.studio,
        ownerId: u.juliana, orgId, value: 0,
        probability: 0, closedAt: daysAgo(10),
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal21 } }) === 0) {
        await createMovement({
            dealId: deals.deal21, orgId, fromStageId: null, fromStageName: null,
            toStageId: sc.clicked, toStageName: "Clicou no Anúncio",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(12)
        });
        await createMovement({
            dealId: deals.deal21, orgId, fromStageId: sc.clicked, fromStageName: "Clicou no Anúncio",
            toStageId: sc.discarded, toStageName: "Descartado",
            movedBy: MovedByType.HUMAN, userId: u.juliana,
            reason: "Lead não tinha perfil para o produto", createdAt: daysAgo(10)
        });
    }

    // =========================================================================
    // PIPELINE 3 — Renovações e Upsell (4 deals)
    // =========================================================================
    const p3 = raw.pipelines.renewal;
    const sr = s.renewal;

    deals.deal22 = await upsertDeal({
        title: "Grupo Expansão RJ — Renovação Enterprise",
        pipelineId: p3, stageId: sr.days90, contactId: c.grupo,
        ownerId: u.fernanda, orgId, value: 144000, probability: 70,
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal22 } }) === 0) {
        await createMovement({
            dealId: deals.deal22, orgId, fromStageId: null, fromStageName: null,
            toStageId: sr.days90, toStageName: "Vencendo em 90 dias",
            movedBy: MovedByType.SYSTEM, reason: "Contrato vence em 90 dias", createdAt: daysAgo(2)
        });
    }

    deals.deal23 = await upsertDeal({
        title: "Tech Solutions BR — Renovação Growth",
        pipelineId: p3, stageId: sr.days30, contactId: c.tech,
        ownerId: u.ricardo, orgId, value: 29964,
        probability: 75, isRotting: true, rottingDays: 3,
        lastActivityAt: daysAgo(3),
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal23 } }) === 0) {
        await createMovement({
            dealId: deals.deal23, orgId, fromStageId: null, fromStageName: null,
            toStageId: sr.days90, toStageName: "Vencendo em 90 dias",
            movedBy: MovedByType.SYSTEM, createdAt: daysAgo(60)
        });
        await createMovement({
            dealId: deals.deal23, orgId, fromStageId: sr.days90, fromStageName: "Vencendo em 90 dias",
            toStageId: sr.days30, toStageName: "Vencendo em 30 dias",
            movedBy: MovedByType.SYSTEM, reason: "Contrato vence em 30 dias", createdAt: daysAgo(5)
        });
    }

    deals.deal24 = await upsertDeal({
        title: "Clínica Saúde Plena — Renovação Starter",
        pipelineId: p3, stageId: sr.negotiating, contactId: c.clinica,
        ownerId: u.juliana, orgId, value: 11964, probability: 85,
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal24 } }) === 0) {
        await createMovement({
            dealId: deals.deal24, orgId, fromStageId: null, fromStageName: null,
            toStageId: sr.days30, toStageName: "Vencendo em 30 dias",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(10)
        });
        await createMovement({
            dealId: deals.deal24, orgId, fromStageId: sr.days30, fromStageName: "Vencendo em 30 dias",
            toStageId: sr.negotiating, toStageName: "Em Negociação",
            movedBy: MovedByType.HUMAN, userId: u.juliana,
            reason: "Cliente quer upgrade para Growth no renewal", createdAt: daysAgo(3)
        });
    }

    deals.deal25 = await upsertDeal({
        title: "Agência Digital Vibe — Renovação Growth",
        pipelineId: p3, stageId: sr.renewed, contactId: c.agencia,
        ownerId: u.ricardo, orgId, value: 29964,
        probability: 100, closedAt: daysAgo(2),
    });
    if (await prisma.dealStageMovement.count({ where: { dealId: deals.deal25 } }) === 0) {
        await createMovement({
            dealId: deals.deal25, orgId, fromStageId: null, fromStageName: null,
            toStageId: sr.days30, toStageName: "Vencendo em 30 dias",
            movedBy: MovedByType.AGENT, agentId: sofiaId, createdAt: daysAgo(20)
        });
        await createMovement({
            dealId: deals.deal25, orgId, fromStageId: sr.days30, fromStageName: "Vencendo em 30 dias",
            toStageId: sr.negotiating, toStageName: "Em Negociação",
            movedBy: MovedByType.HUMAN, userId: u.ricardo, createdAt: daysAgo(10)
        });
        await createMovement({
            dealId: deals.deal25, orgId, fromStageId: sr.negotiating, fromStageName: "Em Negociação",
            toStageId: sr.renewed, toStageName: "Renovado",
            movedBy: MovedByType.HUMAN, userId: u.ricardo,
            reason: "Renovação anual confirmada com desconto fidelidade", createdAt: daysAgo(2)
        });
    }

    // =========================================================================
    // PERSIST IDs
    // =========================================================================
    writeSeedIds({ deals });

    console.log("✅ S06 — Deals: 25 deals, ~65 movimentos de stage");
}

main()
    .catch((e) => {
        console.error("❌ S06 failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

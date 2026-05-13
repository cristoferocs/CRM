/**
 * S04 — Pipelines
 * Popula: Pipeline, PipelineStage
 * Idempotente: usa findFirst antes de criar
 * Depende: .seed-ids.json (S01 + S03)
 */

import { PrismaClient, PipelineType, StageType, StageAgentTrigger } from "@prisma/client";
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
        throw new Error("❌ .seed-ids.json não encontrado. Execute S01-S03 primeiro.");
    }
}

function writeSeedIds(data: Record<string, unknown>): void {
    const existing = readSeedIds();
    fs.writeFileSync(SEED_IDS_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
}

async function upsertPipeline(data: Parameters<typeof prisma.pipeline.create>[0]["data"]) {
    const existing = await prisma.pipeline.findFirst({
        where: { orgId: data.orgId as string, name: data.name as string },
        select: { id: true },
    });
    if (existing) return existing.id;
    const p = await prisma.pipeline.create({ data });
    return p.id;
}

async function createStages(
    pipelineId: string,
    stages: Array<Parameters<typeof prisma.pipelineStage.create>[0]["data"]>
): Promise<Record<string, string>> {
    const ids: Record<string, string> = {};
    const existing = await prisma.pipelineStage.findFirst({ where: { pipelineId }, select: { id: true } });
    if (existing) {
        // already seeded — load all stages for this pipeline
        const all = await prisma.pipelineStage.findMany({ where: { pipelineId }, orderBy: { order: "asc" }, select: { id: true, order: true } });
        for (let i = 0; i < all.length; i++) {
            const key = (stages[i] as any)._key as string;
            if (key) ids[key] = all[i].id;
        }
        return ids;
    }
    for (const stageData of stages) {
        const key = (stageData as any)._key as string;
        const { _key, ...rest } = stageData as any;
        const s = await prisma.pipelineStage.create({ data: { ...rest, pipelineId } });
        if (key) ids[key] = s.id;
    }
    return ids;
}

async function main() {
    const ids = readSeedIds() as { orgId: string; agents: { sofia: string } };
    const { orgId } = ids;
    const sofiaId = ids.agents.sofia;

    // =========================================================================
    // PIPELINE 1 — Funil Principal de Vendas
    // =========================================================================
    const p1Id = await upsertPipeline({
        name: "Funil Principal de Vendas",
        type: PipelineType.SALES,
        isDefault: true,
        color: "#7c5cfc",
        rotting: true,
        rottingDays: 7,
        isActive: true,
        orgId,
    });

    const p1Stages = await createStages(p1Id, [
        {
            _key: "newLead",
            name: "Novo Lead",
            order: 1,
            type: StageType.ENTRY,
            probability: 10,
            color: "#6366f1",
            agentId: sofiaId,
            agentTrigger: StageAgentTrigger.AUTO_ENTER,
            agentGoal: "Qualifique este novo lead e entenda suas necessidades",
            onEnterActions: [
                { type: "notify_owner", message: "Novo lead no funil!" },
                { type: "create_activity", title: "Lead recebido" },
            ],
        } as any,
        {
            _key: "contacted",
            name: "Contato Feito",
            order: 2,
            type: StageType.REGULAR,
            probability: 25,
            color: "#8b5cf6",
            rottingDays: 3,
            onRottingActions: [
                {
                    type: "activate_agent",
                    agentId: sofiaId,
                    message: "Lead parado 3 dias, retome o contato",
                },
            ],
        } as any,
        {
            _key: "qualified",
            name: "Qualificado",
            order: 3,
            type: StageType.REGULAR,
            probability: 40,
            color: "#a78bfa",
            requiredFields: ["company_size", "main_pain", "decision_maker"],
        } as any,
        {
            _key: "proposal",
            name: "Proposta Enviada",
            order: 4,
            type: StageType.DECISION,
            probability: 60,
            color: "#f59e0b",
            rottingDays: 5,
            agentId: sofiaId,
            agentTrigger: StageAgentTrigger.AUTO_ROTTING,
            agentGoal: "Proposta parada. Verifique objeções e tente avançar",
        } as any,
        {
            _key: "negotiation",
            name: "Negociação",
            order: 5,
            type: StageType.DECISION,
            probability: 80,
            color: "#f97316",
            requiredFields: ["budget", "decision_maker"],
        } as any,
        {
            _key: "won",
            name: "Fechado Ganho",
            order: 6,
            type: StageType.WON,
            probability: 100,
            color: "#22c55e",
            isWon: true,
            onEnterActions: [
                { type: "notify_all", message: "🎉 VENDA FECHADA!" },
                { type: "create_activity", title: "Deal ganho" },
            ],
        } as any,
        {
            _key: "lost",
            name: "Fechado Perdido",
            order: 7,
            type: StageType.LOST,
            probability: 0,
            color: "#ef4444",
            isLost: true,
            onEnterActions: [
                { type: "create_activity", title: "Deal perdido — registrar motivo" },
            ],
        } as any,
    ]);

    // =========================================================================
    // PIPELINE 2 — Campanha Meta Ads
    // =========================================================================
    const p2Id = await upsertPipeline({
        name: "Campanha Meta Ads — Produto Digital",
        type: PipelineType.CAMPAIGN,
        color: "#00d4ff",
        context: { campaign: "campanha-meta-jan-2025", adAccount: "act_123456789" },
        rotting: true,
        rottingDays: 2,
        isActive: true,
        orgId,
    });

    const p2Stages = await createStages(p2Id, [
        {
            _key: "clicked",
            name: "Clicou no Anúncio",
            order: 1,
            type: StageType.ENTRY,
            probability: 5,
            color: "#0ea5e9",
            agentId: sofiaId,
            agentTrigger: StageAgentTrigger.AUTO_ENTER,
            agentGoal: "Lead veio de anúncio. Qualifique rapidamente",
        } as any,
        {
            _key: "firstContact",
            name: "Primeiro Contato",
            order: 2,
            type: StageType.REGULAR,
            probability: 20,
            color: "#38bdf8",
        } as any,
        {
            _key: "interested",
            name: "Interesse Confirmado",
            order: 3,
            type: StageType.REGULAR,
            probability: 45,
            color: "#7dd3fc",
        } as any,
        {
            _key: "checkout",
            name: "Checkout Iniciado",
            order: 4,
            type: StageType.DECISION,
            probability: 70,
            color: "#bae6fd",
        } as any,
        {
            _key: "converted",
            name: "Convertido",
            order: 5,
            type: StageType.WON,
            probability: 100,
            color: "#22c55e",
            isWon: true,
        } as any,
        {
            _key: "discarded",
            name: "Descartado",
            order: 6,
            type: StageType.LOST,
            probability: 0,
            color: "#ef4444",
            isLost: true,
        } as any,
    ]);

    // =========================================================================
    // PIPELINE 3 — Renovações e Upsell
    // =========================================================================
    const p3Id = await upsertPipeline({
        name: "Renovações e Upsell",
        type: PipelineType.RENEWAL,
        color: "#00e5a0",
        rotting: true,
        rottingDays: 5,
        isActive: true,
        orgId,
    });

    const p3Stages = await createStages(p3Id, [
        {
            _key: "days90",
            name: "Vencendo em 90 dias",
            order: 1,
            type: StageType.REGULAR,
            probability: 70,
            color: "#34d399",
        } as any,
        {
            _key: "days30",
            name: "Vencendo em 30 dias",
            order: 2,
            type: StageType.REGULAR,
            probability: 75,
            color: "#10b981",
            agentId: sofiaId,
            agentTrigger: StageAgentTrigger.AUTO_ENTER,
            agentGoal: "Contrato vencendo. Inicie a renovação consultivamente",
        } as any,
        {
            _key: "negotiating",
            name: "Em Negociação",
            order: 3,
            type: StageType.DECISION,
            probability: 85,
            color: "#059669",
        } as any,
        {
            _key: "renewed",
            name: "Renovado",
            order: 4,
            type: StageType.WON,
            probability: 100,
            color: "#22c55e",
            isWon: true,
        } as any,
        {
            _key: "cancelled",
            name: "Cancelado",
            order: 5,
            type: StageType.LOST,
            probability: 0,
            color: "#ef4444",
            isLost: true,
        } as any,
    ]);

    // =========================================================================
    // PERSIST IDs
    // =========================================================================
    writeSeedIds({
        pipelines: { main: p1Id, campaign: p2Id, renewal: p3Id },
        stages: {
            main: p1Stages,
            campaign: p2Stages,
            renewal: p3Stages,
        },
    });

    console.log("✅ S04 — Pipelines: 3 pipelines, 18 stages configurados");
}

main()
    .catch((e) => {
        console.error("❌ S04 failed:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());

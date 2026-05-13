/**
 * pipeline-tools.ts
 *
 * Pipeline-aware tools for Super Agents.
 * These tools allow agents to interact with the pipeline bidirectionally:
 * move deals, create deals, update deal data, qualify leads, mark lost,
 * and schedule human follow-ups.
 */
import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";
import { getIO } from "../../../../websocket/socket.js";
import type { AgentTool, ToolContext, ToolResult } from "../tool-registry.js";

// ---------------------------------------------------------------------------
// Helper: resolve the dealId for the current session
// ---------------------------------------------------------------------------

async function resolveDeal(context: ToolContext) {
    const dealId = (context as unknown as Record<string, unknown>)["dealId"] as string | undefined;
    if (dealId) {
        return prisma.deal.findFirst({
            where: { id: dealId, orgId: context.orgId, isActive: true },
            select: {
                id: true,
                title: true,
                value: true,
                currency: true,
                probability: true,
                isRotting: true,
                stageId: true,
                pipelineId: true,
                contactId: true,
                ownerId: true,
                customFields: true,
                stageHistory: true,
                stageEnteredAt: true,
                createdAt: true,
                stage: { select: { id: true, name: true, order: true, isWon: true, isLost: true } },
                pipeline: { select: { id: true, name: true, rottingDays: true } },
                activities: {
                    select: { id: true, type: true, title: true, description: true, createdAt: true },
                    orderBy: { createdAt: "desc" as const },
                    take: 5,
                },
            },
        });
    }
    // Fallback: find latest active deal for this contact
    return prisma.deal.findFirst({
        where: { contactId: context.contactId, orgId: context.orgId, isActive: true },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            title: true,
            value: true,
            currency: true,
            probability: true,
            isRotting: true,
            stageId: true,
            pipelineId: true,
            contactId: true,
            ownerId: true,
            customFields: true,
            stageHistory: true,
            stageEnteredAt: true,
            createdAt: true,
            stage: { select: { id: true, name: true, order: true, isWon: true, isLost: true } },
            pipeline: { select: { id: true, name: true, rottingDays: true } },
            activities: {
                select: { id: true, type: true, title: true, description: true, createdAt: true },
                orderBy: { createdAt: "desc" as const },
                take: 5,
            },
        },
    });
}

// ---------------------------------------------------------------------------
// 1. get_deal_info
// ---------------------------------------------------------------------------

export const getDealInfo: AgentTool = {
    name: "get_deal_info",
    description: "Busca informações do deal atual: stage, valor, probabilidade, histórico de movimentos",
    when: "Use no início de uma sessão ligada a um deal, ou quando precisar conhecer o estado atual do negócio antes de tomar uma decisão.",
    requiresConfirmation: false,
    riskLevel: "low",
    parametersSchema: z.object({
        dealId: z.string().optional().describe("ID do deal. Omitir para usar o deal vinculado à sessão atual."),
    }),
    async execute(params, context): Promise<ToolResult> {
        const p = params as { dealId?: string };
        const ctxWithDeal = p.dealId
            ? { ...context, dealId: p.dealId }
            : context;

        const deal = await resolveDeal(ctxWithDeal as ToolContext);
        if (!deal) {
            return {
                success: false,
                error: "Nenhum deal encontrado para este contexto.",
                humanReadable: "❌ Nenhum deal ativo encontrado para este contato ou sessão.",
            };
        }

        const daysInStage = Math.floor(
            (Date.now() - new Date(deal.stageEnteredAt).getTime()) / 86_400_000,
        );

        const data = {
            id: deal.id,
            title: deal.title,
            value: deal.value,
            currency: deal.currency,
            probability: deal.probability,
            isRotting: deal.isRotting,
            daysInCurrentStage: daysInStage,
            stage: deal.stage,
            pipeline: deal.pipeline,
            customFields: deal.customFields,
            stageHistory: deal.stageHistory,
            recentActivities: deal.activities,
        };

        return {
            success: true,
            data,
            humanReadable:
                `📊 Deal: "${deal.title}" | Etapa: ${deal.stage.name} | Valor: ${deal.currency} ${deal.value ?? 0} | ` +
                `Probabilidade: ${deal.probability}% | ${daysInStage} dia(s) nesta etapa` +
                (deal.isRotting ? " ⚠️ Rotting" : ""),
        };
    },
};

// ---------------------------------------------------------------------------
// 2. move_deal_stage
// ---------------------------------------------------------------------------

export const moveDealStage: AgentTool = {
    name: "move_deal_stage",
    description: "Move o deal para a próxima etapa do pipeline quando critérios forem atingidos",
    when: "Use quando o cliente confirmar interesse, aceitar proposta, ou atingir critérios de avanço definidos no flowTemplate do agente.",
    requiresConfirmation: false, // dynamically set to true for multi-stage skips (checked inside execute)
    riskLevel: "medium",
    parametersSchema: z.object({
        targetStageId: z.string().describe("ID da etapa de destino"),
        reason: z.string().min(5).describe("Motivo da movimentação"),
        dataCollected: z.record(z.string(), z.unknown()).optional().describe("Dados coletados durante esta etapa que justificam o avanço"),
    }),
    async execute(params, context): Promise<ToolResult> {
        const p = params as { targetStageId: string; reason: string; dataCollected?: Record<string, unknown> };

        const deal = await resolveDeal(context);
        if (!deal) {
            return { success: false, error: "Deal não encontrado.", humanReadable: "❌ Deal não encontrado para mover." };
        }

        const [currentStage, targetStage] = await Promise.all([
            prisma.pipelineStage.findUnique({
                where: { id: deal.stageId },
                select: { id: true, name: true, order: true, pipelineId: true },
            }),
            prisma.pipelineStage.findUnique({
                where: { id: p.targetStageId },
                select: { id: true, name: true, order: true, pipelineId: true, isWon: true, isLost: true },
            }),
        ]);

        if (!currentStage || !targetStage) {
            return { success: false, error: "Etapa não encontrada.", humanReadable: "❌ Etapa de origem ou destino não encontrada." };
        }
        if (targetStage.pipelineId !== deal.pipelineId) {
            return { success: false, error: "Etapa pertence a outro pipeline.", humanReadable: "❌ A etapa de destino não pertence ao pipeline deste deal." };
        }

        // Detect multi-stage skip (more than 1 step forward)
        const stageGap = targetStage.order - currentStage.order;
        if (stageGap > 1) {
            // Record that this requires human confirmation but proceed — the orchestrator checks requiresConfirmation at runtime
            // We return a structured response indicating the jump
            return {
                success: false,
                error: "REQUIRES_CONFIRMATION",
                humanReadable:
                    `⚠️ Esta movimentação pula ${stageGap} etapas (de "${currentStage.name}" para "${targetStage.name}"). ` +
                    `Confirme com um humano antes de executar este salto.`,
                data: { requiresConfirmation: true, stageGap, currentStage: currentStage.name, targetStage: targetStage.name },
            };
        }

        const now = new Date();
        const daysInPrev = (now.getTime() - new Date(deal.stageEnteredAt).getTime()) / 86_400_000;
        const currentHistory = Array.isArray(deal.stageHistory) ? deal.stageHistory : [];

        // Execute movement in transaction
        await prisma.$transaction(async (tx) => {
            await tx.deal.update({
                where: { id: deal.id },
                data: {
                    stageId: p.targetStageId,
                    stageEnteredAt: now,
                    lastActivityAt: now,
                    isRotting: false,
                    stageHistory: [
                        ...currentHistory,
                        {
                            stageId: p.targetStageId,
                            stageName: targetStage.name,
                            enteredAt: now.toISOString(),
                            movedBy: "AGENT",
                            agentId: context.agentId,
                        },
                    ] as never,
                },
            });

            await tx.dealStageMovement.create({
                data: {
                    dealId: deal.id,
                    orgId: context.orgId,
                    fromStageId: deal.stageId,
                    toStageId: p.targetStageId,
                    fromStageName: currentStage.name,
                    toStageName: targetStage.name,
                    movedBy: "AGENT",
                    agentId: context.agentId,
                    agentSessionId: context.sessionId ?? null,
                    reason: p.reason,
                    dataCollected: (p.dataCollected ?? {}) as never,
                    daysInPreviousStage: daysInPrev,
                },
            });

            await tx.activity.create({
                data: {
                    type: "SYSTEM" as never,
                    title: `Deal movido para "${targetStage.name}" pelo agente`,
                    description: p.reason,
                    dealId: deal.id,
                    contactId: deal.contactId,
                    userId: null as never,
                    orgId: context.orgId,
                },
            });
        });

        // Emit socket
        getIO()?.to(`org:${context.orgId}`).emit("pipeline:deal_moved", {
            dealId: deal.id,
            fromStageId: deal.stageId,
            toStageId: p.targetStageId,
            toStageName: targetStage.name,
            pipelineId: deal.pipelineId,
            movedBy: "AGENT",
            agentId: context.agentId,
        });

        return {
            success: true,
            data: { dealId: deal.id, fromStage: currentStage.name, toStage: targetStage.name, isWon: targetStage.isWon, isLost: targetStage.isLost },
            humanReadable: `✅ Deal "${deal.title}" movido de "${currentStage.name}" para "${targetStage.name}". Motivo: ${p.reason}`,
        };
    },
};

// ---------------------------------------------------------------------------
// 3. create_deal (pipeline-aware replacement)
// ---------------------------------------------------------------------------

export const createDealPipeline: AgentTool = {
    name: "create_deal",
    description: "Cria um novo deal no pipeline quando lead demonstra interesse real",
    when: "Use quando o lead demonstrar intenção de compra clara e ainda não houver um deal aberto neste pipeline.",
    requiresConfirmation: false,
    riskLevel: "low",
    parametersSchema: z.object({
        title: z.string().min(1).describe("Título do deal"),
        value: z.number().nonnegative().optional().describe("Valor estimado em BRL"),
        stageId: z.string().optional().describe("ID da etapa inicial. Se omitido, usa o primeiro stage do pipeline do agente."),
        customFields: z.record(z.string(), z.unknown()).optional().describe("Campos customizados iniciais"),
    }),
    async execute(params, context): Promise<ToolResult> {
        const p = params as { title: string; value?: number; stageId?: string; customFields?: Record<string, unknown> };

        // Resolve pipeline via agent's stage assignments or default pipeline
        let pipelineId: string;
        let stageId: string;

        if (p.stageId) {
            const stage = await prisma.pipelineStage.findFirst({
                where: { id: p.stageId },
                select: { id: true, pipelineId: true },
            });
            if (!stage) {
                return { success: false, error: "Stage não encontrado.", humanReadable: "❌ Stage informado não encontrado." };
            }
            pipelineId = stage.pipelineId;
            stageId = stage.id;
        } else {
            // Try to use pipeline linked to this agent
            const agentStage = await prisma.pipelineStage.findFirst({
                where: { agentId: context.agentId },
                orderBy: { order: "asc" },
                select: { id: true, pipelineId: true },
            });

            if (agentStage) {
                pipelineId = agentStage.pipelineId;
                // Get first entry stage
                const firstStage = await prisma.pipelineStage.findFirst({
                    where: { pipelineId, isLost: false },
                    orderBy: { order: "asc" },
                    select: { id: true },
                });
                stageId = firstStage?.id ?? agentStage.id;
            } else {
                // Fall back to default pipeline
                const pipeline = await prisma.pipeline.findFirst({
                    where: { orgId: context.orgId, isDefault: true, isActive: true },
                    select: { id: true },
                });
                if (!pipeline) {
                    return { success: false, error: "Nenhum pipeline disponível.", humanReadable: "❌ Nenhum pipeline padrão configurado." };
                }
                pipelineId = pipeline.id;
                const firstStage = await prisma.pipelineStage.findFirst({
                    where: { pipelineId, isLost: false },
                    orderBy: { order: "asc" },
                    select: { id: true, name: true },
                });
                if (!firstStage) {
                    return { success: false, error: "Pipeline sem etapas.", humanReadable: "❌ O pipeline não possui etapas configuradas." };
                }
                stageId = firstStage.id;
            }
        }

        // Resolve owner: the deal owner from the org (seller)
        const owner = await prisma.user.findFirst({
            where: { orgId: context.orgId, isActive: true, role: { in: ["SELLER", "MANAGER", "ADMIN"] } },
            orderBy: { createdAt: "asc" },
            select: { id: true },
        });

        const deal = await prisma.deal.create({
            data: {
                title: p.title,
                value: p.value ?? 0,
                currency: "BRL",
                probability: 0,
                pipelineId,
                stageId,
                contactId: context.contactId,
                orgId: context.orgId,
                ownerId: owner?.id ?? context.agentId, // fallback to agentId as ownerId for now
                customFields: {
                    ...(p.customFields ?? {}),
                    _createdByAgent: context.agentId,
                    _createdBySession: context.sessionId,
                } as never,
            },
            select: { id: true, title: true, stageId: true },
        });

        await prisma.timelineEvent.create({
            data: {
                type: "DEAL_CREATED",
                title: `Deal "${p.title}" criado pelo agente`,
                metadata: { dealId: deal.id, agentId: context.agentId, sessionId: context.sessionId } as never,
                contactId: context.contactId,
                orgId: context.orgId,
            },
        });

        getIO()?.to(`org:${context.orgId}`).emit("deal:created", {
            dealId: deal.id,
            title: deal.title,
            triggeredBy: "ai_agent",
            agentId: context.agentId,
        });

        return {
            success: true,
            data: { dealId: deal.id, stageId: deal.stageId, pipelineId },
            humanReadable: `✅ Deal "${p.title}" criado com sucesso (ID: ${deal.id})`,
        };
    },
};

// ---------------------------------------------------------------------------
// 4. update_deal_value
// ---------------------------------------------------------------------------

export const updateDealValue: AgentTool = {
    name: "update_deal_value",
    description: "Atualiza o valor estimado do deal conforme informações coletadas",
    when: "Use quando o cliente revelar seu orçamento, confirmar o pacote desejado ou quando você calcular um valor mais preciso com base nas informações coletadas.",
    requiresConfirmation: false,
    riskLevel: "low",
    parametersSchema: z.object({
        value: z.number().nonnegative().describe("Novo valor estimado em BRL"),
        reason: z.string().min(5).describe("Justificativa para a atualização do valor"),
    }),
    async execute(params, context): Promise<ToolResult> {
        const p = params as { value: number; reason: string };

        const deal = await resolveDeal(context);
        if (!deal) {
            return { success: false, error: "Deal não encontrado.", humanReadable: "❌ Nenhum deal ativo para atualizar." };
        }

        const oldValue = deal.value;
        await prisma.deal.update({
            where: { id: deal.id },
            data: { value: p.value, lastActivityAt: new Date() },
        });

        await prisma.activity.create({
            data: {
                type: "SYSTEM" as never,
                title: `Valor atualizado pelo agente: R$ ${oldValue ?? 0} → R$ ${p.value}`,
                description: p.reason,
                dealId: deal.id,
                contactId: deal.contactId,
                userId: null as never,
                orgId: context.orgId,
            },
        });

        return {
            success: true,
            data: { dealId: deal.id, oldValue, newValue: p.value },
            humanReadable: `✅ Valor do deal "${deal.title}" atualizado: R$ ${oldValue ?? 0} → R$ ${p.value}. Motivo: ${p.reason}`,
        };
    },
};

// ---------------------------------------------------------------------------
// 5. update_deal_fields
// ---------------------------------------------------------------------------

export const updateDealFields: AgentTool = {
    name: "update_deal_fields",
    description: "Atualiza campos customizados do deal com informações coletadas do cliente",
    when: "Use sempre que coletar dados relevantes do cliente (necessidades, prazos, restrições, preferências) que devem ser registrados no deal para uso futuro.",
    requiresConfirmation: false,
    riskLevel: "low",
    parametersSchema: z.object({
        fields: z.record(z.string(), z.unknown()).describe("Campos a registrar no deal (merge com os existentes)"),
    }),
    async execute(params, context): Promise<ToolResult> {
        const p = params as { fields: Record<string, unknown> };

        const deal = await resolveDeal(context);
        if (!deal) {
            return { success: false, error: "Deal não encontrado.", humanReadable: "❌ Nenhum deal ativo para atualizar." };
        }

        const existing = (deal.customFields as Record<string, unknown>) ?? {};
        const merged = { ...existing, ...p.fields };

        await prisma.deal.update({
            where: { id: deal.id },
            data: { customFields: merged as never, lastActivityAt: new Date() },
        });

        const fieldNames = Object.keys(p.fields).join(", ");
        return {
            success: true,
            data: { dealId: deal.id, updatedFields: p.fields },
            humanReadable: `✅ Campos do deal "${deal.title}" atualizados: ${fieldNames}`,
        };
    },
};

// ---------------------------------------------------------------------------
// 6. qualify_and_advance
// ---------------------------------------------------------------------------

export const qualifyAndAdvance: AgentTool = {
    name: "qualify_and_advance",
    description: "Qualifica o lead e avança para etapa de qualificado automaticamente",
    when: "Use quando o lead fornecer todos os dados de qualificação (BANT ou similar) e estiver pronto para avançar no pipeline. Se o stage destino for isWon, promove o contato para CUSTOMER.",
    requiresConfirmation: false,
    riskLevel: "medium",
    parametersSchema: z.object({
        qualificationData: z.record(z.string(), z.unknown()).describe("Dados de qualificação coletados (budget, authority, need, timeline, etc.)"),
        nextStageId: z.string().describe("ID da etapa de qualificado para onde o deal será movido"),
    }),
    async execute(params, context): Promise<ToolResult> {
        const p = params as { qualificationData: Record<string, unknown>; nextStageId: string };

        const deal = await resolveDeal(context);
        if (!deal) {
            return { success: false, error: "Deal não encontrado.", humanReadable: "❌ Nenhum deal ativo para qualificar." };
        }

        const nextStage = await prisma.pipelineStage.findUnique({
            where: { id: p.nextStageId },
            select: { id: true, name: true, order: true, pipelineId: true, isWon: true, isLost: true },
        });
        if (!nextStage) {
            return { success: false, error: "Etapa não encontrada.", humanReadable: "❌ Etapa de destino não encontrada." };
        }
        if (nextStage.pipelineId !== deal.pipelineId) {
            return { success: false, error: "Etapa de outro pipeline.", humanReadable: "❌ A etapa não pertence ao pipeline deste deal." };
        }

        // Merge qualification data into customFields
        const existing = (deal.customFields as Record<string, unknown>) ?? {};
        const now = new Date();
        const currentHistory = Array.isArray(deal.stageHistory) ? deal.stageHistory : [];

        await prisma.$transaction(async (tx) => {
            await tx.deal.update({
                where: { id: deal.id },
                data: {
                    stageId: p.nextStageId,
                    stageEnteredAt: now,
                    lastActivityAt: now,
                    isRotting: false,
                    customFields: {
                        ...existing,
                        qualification: {
                            ...p.qualificationData,
                            qualifiedAt: now.toISOString(),
                            qualifiedByAgent: context.agentId,
                        },
                    } as never,
                    stageHistory: [
                        ...currentHistory,
                        {
                            stageId: p.nextStageId,
                            stageName: nextStage.name,
                            enteredAt: now.toISOString(),
                            movedBy: "AGENT",
                            agentId: context.agentId,
                        },
                    ] as never,
                },
            });

            await tx.dealStageMovement.create({
                data: {
                    dealId: deal.id,
                    orgId: context.orgId,
                    fromStageId: deal.stageId,
                    toStageId: p.nextStageId,
                    fromStageName: deal.stage.name,
                    toStageName: nextStage.name,
                    movedBy: "AGENT",
                    agentId: context.agentId,
                    agentSessionId: context.sessionId ?? null,
                    reason: "Lead qualificado pelo agente",
                    dataCollected: p.qualificationData as never,
                    daysInPreviousStage: (now.getTime() - new Date(deal.stageEnteredAt).getTime()) / 86_400_000,
                },
            });

            // If stage isWon: promote contact to CUSTOMER
            if (nextStage.isWon) {
                await tx.contact.updateMany({
                    where: { id: deal.contactId, type: "LEAD" },
                    data: { type: "CUSTOMER" },
                });
            }

            await tx.activity.create({
                data: {
                    type: "SYSTEM" as never,
                    title: `Lead qualificado e movido para "${nextStage.name}"`,
                    dealId: deal.id,
                    contactId: deal.contactId,
                    userId: null as never,
                    orgId: context.orgId,
                },
            });
        });

        getIO()?.to(`org:${context.orgId}`).emit("pipeline:deal_moved", {
            dealId: deal.id,
            fromStageId: deal.stageId,
            toStageId: p.nextStageId,
            toStageName: nextStage.name,
            pipelineId: deal.pipelineId,
            movedBy: "AGENT",
            agentId: context.agentId,
        });

        return {
            success: true,
            data: { dealId: deal.id, toStage: nextStage.name, isWon: nextStage.isWon, qualificationData: p.qualificationData },
            humanReadable:
                `✅ Lead qualificado e movido para "${nextStage.name}".` +
                (nextStage.isWon ? " Contato promovido para CUSTOMER." : ""),
        };
    },
};

// ---------------------------------------------------------------------------
// 7. mark_deal_lost
// ---------------------------------------------------------------------------

export const markDealLost: AgentTool = {
    name: "mark_deal_lost",
    description: "Marca o deal como perdido com motivo — usar apenas quando cliente declinar definitivamente",
    when: "Use SOMENTE quando o cliente declinar explícita e definitivamente (ex: 'não tenho interesse', 'vou com outro fornecedor'). Nunca use por hesitação momentânea.",
    requiresConfirmation: true, // always requires human confirmation
    riskLevel: "high",
    parametersSchema: z.object({
        reason: z.string().min(10).describe("Motivo claro e detalhado da perda"),
        feedback: z.string().optional().describe("Feedback adicional do cliente para aprendizado"),
    }),
    async execute(params, context): Promise<ToolResult> {
        const p = params as { reason: string; feedback?: string };

        const deal = await resolveDeal(context);
        if (!deal) {
            return { success: false, error: "Deal não encontrado.", humanReadable: "❌ Nenhum deal ativo para marcar como perdido." };
        }

        // Find the LOST stage in this pipeline
        const lostStage = await prisma.pipelineStage.findFirst({
            where: { pipelineId: deal.pipelineId, isLost: true },
            orderBy: { order: "asc" },
            select: { id: true, name: true },
        });
        if (!lostStage) {
            return { success: false, error: "Etapa de Perdido não encontrada.", humanReadable: "❌ Este pipeline não possui uma etapa de Perdido configurada." };
        }

        const now = new Date();
        const currentHistory = Array.isArray(deal.stageHistory) ? deal.stageHistory : [];

        await prisma.$transaction(async (tx) => {
            await tx.deal.update({
                where: { id: deal.id },
                data: {
                    stageId: lostStage.id,
                    stageEnteredAt: now,
                    lastActivityAt: now,
                    isRotting: false,
                    stageHistory: [
                        ...currentHistory,
                        {
                            stageId: lostStage.id,
                            stageName: lostStage.name,
                            enteredAt: now.toISOString(),
                            movedBy: "AGENT",
                            agentId: context.agentId,
                            reason: p.reason,
                        },
                    ] as never,
                },
            });

            await tx.dealStageMovement.create({
                data: {
                    dealId: deal.id,
                    orgId: context.orgId,
                    fromStageId: deal.stageId,
                    toStageId: lostStage.id,
                    fromStageName: deal.stage.name,
                    toStageName: lostStage.name,
                    movedBy: "AGENT",
                    agentId: context.agentId,
                    agentSessionId: context.sessionId ?? null,
                    reason: p.reason,
                    daysInPreviousStage: (now.getTime() - new Date(deal.stageEnteredAt).getTime()) / 86_400_000,
                },
            });

            await tx.activity.create({
                data: {
                    type: "SYSTEM" as never,
                    title: `Deal marcado como perdido pelo agente`,
                    description: p.reason,
                    dealId: deal.id,
                    contactId: deal.contactId,
                    userId: null as never,
                    orgId: context.orgId,
                },
            });
        });

        // Create AIInsight for OBJECTION learning
        if (p.feedback) {
            await prisma.aIInsight.create({
                data: {
                    type: "OBJECTION",
                    title: `Objeção fatal: deal perdido — ${deal.title}`,
                    content: p.feedback,
                    confidence: 0.9,
                    sourceConversationIds: context.conversationId ? [context.conversationId] : [],
                    metadata: {
                        dealId: deal.id,
                        agentId: context.agentId,
                        sessionId: context.sessionId,
                        lostReason: p.reason,
                    } as never,
                    orgId: context.orgId,
                },
            }).catch(() => null); // non-critical
        }

        getIO()?.to(`org:${context.orgId}`).emit("pipeline:deal_moved", {
            dealId: deal.id,
            fromStageId: deal.stageId,
            toStageId: lostStage.id,
            toStageName: lostStage.name,
            pipelineId: deal.pipelineId,
            movedBy: "AGENT",
            isLost: true,
        });

        return {
            success: true,
            data: { dealId: deal.id, lostStage: lostStage.name, reason: p.reason },
            humanReadable: `✅ Deal "${deal.title}" marcado como perdido. Motivo: ${p.reason}`,
        };
    },
};

// ---------------------------------------------------------------------------
// 8. schedule_human_followup
// ---------------------------------------------------------------------------

export const scheduleHumanFollowup: AgentTool = {
    name: "schedule_human_followup",
    description: "Agenda tarefa de follow-up para um vendedor humano",
    when: "Use quando o cliente precisar de atenção humana, pedir para ser contatado mais tarde, ou quando o próximo passo requer ação manual (envio de contrato, negociação avançada, etc.).",
    requiresConfirmation: false,
    riskLevel: "low",
    parametersSchema: z.object({
        assignTo: z.string().optional().describe("ID do usuário (vendedor) para atribuir. Omitir para atribuir ao owner do deal."),
        dueAt: z.string().describe("Data/hora para o follow-up (ISO 8601, ex: '2026-05-14T10:00:00Z')"),
        note: z.string().min(10).describe("Instrução detalhada para o vendedor: contexto, o que foi discutido, próximo passo recomendado"),
    }),
    async execute(params, context): Promise<ToolResult> {
        const p = params as { assignTo?: string; dueAt: string; note: string };

        const deal = await resolveDeal(context);
        if (!deal) {
            return { success: false, error: "Deal não encontrado.", humanReadable: "❌ Nenhum deal ativo para agendar follow-up." };
        }

        // Resolve assignee
        let assigneeId = p.assignTo ?? deal.ownerId;
        let assigneeName = "Responsável do deal";

        const user = await prisma.user.findFirst({
            where: { id: assigneeId, orgId: context.orgId, isActive: true },
            select: { id: true, name: true },
        });

        if (!user) {
            // Fallback: first active seller
            const fallback = await prisma.user.findFirst({
                where: { orgId: context.orgId, isActive: true, role: { in: ["SELLER", "MANAGER", "ADMIN"] } },
                orderBy: { createdAt: "asc" },
                select: { id: true, name: true },
            });
            if (!fallback) {
                return { success: false, error: "Nenhum vendedor disponível.", humanReadable: "❌ Nenhum vendedor ativo encontrado para atribuir o follow-up." };
            }
            assigneeId = fallback.id;
            assigneeName = fallback.name;
        } else {
            assigneeName = user.name;
        }

        const dueDate = new Date(p.dueAt);
        const activity = await prisma.activity.create({
            data: {
                type: "TASK" as never,
                title: `Follow-up agendado pelo agente`,
                description:
                    `[Criado pelo Agente de IA: ${context.agentId}]\n\n` +
                    `${p.note}\n\n` +
                    `Sessão: ${context.sessionId ?? "-"} | Conversa: ${context.conversationId}`,
                dueAt: dueDate,
                dealId: deal.id,
                contactId: deal.contactId,
                userId: assigneeId,
                orgId: context.orgId,
            },
            select: { id: true },
        });

        // Notify assignee via socket
        getIO()?.to(`org:${context.orgId}`).emit("task:assigned", {
            activityId: activity.id,
            assigneeId,
            dealId: deal.id,
            contactId: deal.contactId,
            dueAt: dueDate,
            createdByAgent: context.agentId,
            note: p.note,
        });

        return {
            success: true,
            data: { activityId: activity.id, assigneeId, assigneeName, dueAt: p.dueAt },
            humanReadable:
                `✅ Follow-up agendado para ${assigneeName} em ${new Date(p.dueAt).toLocaleString("pt-BR")}.` +
                ` Tarefa: ${activity.id}`,
        };
    },
};

// ---------------------------------------------------------------------------
// Exports for registration in index.ts
// ---------------------------------------------------------------------------

export const PIPELINE_TOOLS: AgentTool[] = [
    getDealInfo,
    moveDealStage,
    createDealPipeline,
    updateDealValue,
    updateDealFields,
    qualifyAndAdvance,
    markDealLost,
    scheduleHumanFollowup,
];

/**
 * pipeline-agent.bridge.ts
 *
 * Bridges pipeline events to Super Agent activations.
 * Called by pipeline service when deals enter stages, start rotting,
 * or move between stages. Handles:
 *   - AUTO_ENTER: start proactive agent session when deal enters stage
 *   - AUTO_ROTTING: re-engage stalled deals via agent
 *   - Movement tracking: learning data + downgrade coaching insights
 */
import { prisma } from "../../lib/prisma.js";
import { queues } from "../../queue/queues.js";
import { getIO } from "../../websocket/socket.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BridgeDeal {
    id: string;
    title: string;
    contactId: string;
    pipelineId: string;
    stageId: string;
    ownerId: string;
    customFields: unknown;
    stageHistory: unknown;
    lastActivityAt: Date | null;
}

export interface BridgeStage {
    id: string;
    name: string;
    order: number;
    agentId: string | null;
    agentTrigger: string;
    agentGoal: string | null;
    onEnterActions: unknown;
    onRottingActions: unknown;
}

export interface BridgeMovement {
    id: string;
    dealId: string;
    orgId: string;
    fromStageId: string | null;
    toStageId: string;
    fromStageName: string | null;
    toStageName: string;
    movedBy: string;
    userId?: string | null;
    agentId?: string | null;
    agentSessionId?: string | null;
    daysInPreviousStage?: number;
}

// ---------------------------------------------------------------------------
// PipelineAgentBridge
// ---------------------------------------------------------------------------

export class PipelineAgentBridge {
    // =========================================================================
    // onDealEnterStage
    // Called by pipeline.service when a deal moves to a new stage
    // =========================================================================

    async onDealEnterStage(deal: BridgeDeal, stage: BridgeStage, orgId: string): Promise<void> {
        if (!stage.agentId || stage.agentTrigger !== "AUTO_ENTER") return;

        try {
            // Check if agent session already exists for this deal+agent
            const existingSession = await prisma.aIAgentSession.findFirst({
                where: {
                    agentId: stage.agentId,
                    status: { in: ["ACTIVE", "THINKING", "WAITING_USER"] },
                    // Link via conversation on the contact
                    conversation: {
                        contactId: deal.contactId,
                        orgId,
                    },
                },
                select: { id: true },
            });

            if (existingSession) {
                // Session already active — do not create a duplicate
                return;
            }

            // Build context message for the agent
            const contact = await prisma.contact.findUnique({
                where: { id: deal.contactId },
                select: { id: true, name: true, phone: true, email: true, type: true, tags: true, customFields: true },
            });

            const customFields = (deal.customFields as Record<string, unknown>) ?? {};
            const contextMessage = [
                `Um lead entrou na etapa "${stage.name}".`,
                `Lead: ${contact?.name ?? deal.contactId} (${contact?.type ?? "LEAD"})`,
                `Deal: "${deal.title}"`,
                `Dados coletados até aqui: ${JSON.stringify(customFields)}`,
                stage.agentGoal ? `Seu objetivo nesta etapa: ${stage.agentGoal}` : "",
                `Inicie o contato de forma proativa.`,
            ]
                .filter(Boolean)
                .join("\n");

            // Enqueue proactive contact job
            await queues.ai().add("agent:proactive_contact", {
                type: "proactive_contact",
                agentId: stage.agentId,
                dealId: deal.id,
                contactId: deal.contactId,
                orgId,
                stageId: stage.id,
                stageName: stage.name,
                agentGoal: stage.agentGoal,
                contextMessage,
                triggerType: "AUTO_ENTER",
            });
        } catch (err) {
            // Bridge failures are non-critical — log only
            console.error("[PipelineAgentBridge] onDealEnterStage error:", err);
        }
    }

    // =========================================================================
    // onDealRotting
    // Called when checkRottingDeals marks a deal as rotting
    // =========================================================================

    async onDealRotting(deal: BridgeDeal, stage: BridgeStage, orgId: string): Promise<void> {
        if (!stage.agentId || stage.agentTrigger !== "AUTO_ROTTING") return;

        try {
            // Check if agent already active on this deal
            const dealRecord = await prisma.deal.findUnique({
                where: { id: deal.id },
                select: { activeAgentSessionId: true, lastActivityAt: true },
            });

            if (dealRecord?.activeAgentSessionId) {
                // Agent already engaged — don't trigger again
                return;
            }

            // Compute days stalled
            const lastActivity = dealRecord?.lastActivityAt ?? deal.lastActivityAt;
            const daysSinceActivity = lastActivity
                ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
                : 0;

            // Find last message from contact in conversations
            const lastConversation = await prisma.conversation.findFirst({
                where: { contactId: deal.contactId, orgId },
                orderBy: { lastMessageAt: "desc" },
                select: {
                    id: true,
                    messages: {
                        where: { direction: "INBOUND" },
                        orderBy: { sentAt: "desc" },
                        take: 1,
                        select: { content: true, sentAt: true },
                    },
                },
            });

            const contact = await prisma.contact.findUnique({
                where: { id: deal.contactId },
                select: { name: true },
            });

            const lastMessage = lastConversation?.messages[0];
            const contextMessage = [
                `O lead "${contact?.name ?? deal.contactId}" está parado há ${daysSinceActivity} dia(s) na etapa "${stage.name}".`,
                `Deal: "${deal.title}"`,
                lastMessage
                    ? `Último contato: "${lastMessage.content}" (${new Date(lastMessage.sentAt).toLocaleDateString("pt-BR")})`
                    : "Não há histórico de mensagens recentes.",
                `Retome o contato com uma abordagem de reengajamento.`,
                `Use uma abordagem diferente da anterior. Considere oferecer algo novo ou perguntar o que mudou.`,
            ]
                .filter(Boolean)
                .join("\n");

            await queues.ai().add("agent:reengagement", {
                type: "reengagement",
                agentId: stage.agentId,
                dealId: deal.id,
                contactId: deal.contactId,
                orgId,
                stageId: stage.id,
                stageName: stage.name,
                agentGoal: stage.agentGoal,
                contextMessage,
                triggerType: "AUTO_ROTTING",
                daysSinceActivity,
            });
        } catch (err) {
            console.error("[PipelineAgentBridge] onDealRotting error:", err);
        }
    }

    // =========================================================================
    // onDealMoved
    // Called every time a deal moves — tracks learning and coaching insights
    // =========================================================================

    async onDealMoved(movement: BridgeMovement, orgId: string): Promise<void> {
        try {
            // 1. If moved by AGENT: store learning data
            if (movement.movedBy === "AGENT" && movement.agentId) {
                await prisma.aITrainingData.create({
                    data: {
                        type: "SALES_APPROACH",
                        input: JSON.stringify({
                            dealId: movement.dealId,
                            fromStage: movement.fromStageName,
                            toStage: movement.toStageName,
                            daysInStage: movement.daysInPreviousStage,
                            agentId: movement.agentId,
                            agentSessionId: movement.agentSessionId,
                        }),
                        output: JSON.stringify({
                            action: "stage_move",
                            result: "success",
                            movedBy: "AGENT",
                        }),
                        isValidated: false,
                        orgId,
                    },
                }).catch(() => null); // non-critical
            }

            // 2. If moved BACKWARDS by HUMAN (downgrade): create COACHING insight
            if (movement.movedBy === "HUMAN" && movement.fromStageId && movement.toStageId) {
                const [fromStage, toStage] = await Promise.all([
                    prisma.pipelineStage.findUnique({ where: { id: movement.fromStageId }, select: { order: true } }),
                    prisma.pipelineStage.findUnique({ where: { id: movement.toStageId }, select: { order: true } }),
                ]);

                const isDowngrade = fromStage && toStage && toStage.order < fromStage.order;
                if (isDowngrade) {
                    await prisma.aIInsight.create({
                        data: {
                            type: "COACHING",
                            title: `Movimentação revertida: "${movement.fromStageName}" → "${movement.toStageName}"`,
                            content:
                                `Um humano reverteu a movimentação do deal ${movement.dealId} ` +
                                `de "${movement.fromStageName}" de volta para "${movement.toStageName}". ` +
                                `Isso indica que o agente pode ter avançado prematuramente. ` +
                                `Analisar no weeklyRefinement.`,
                            confidence: 0.8,
                            sourceConversationIds: [],
                            metadata: {
                                dealId: movement.dealId,
                                agentId: movement.agentId,
                                movementId: movement.id,
                                fromStage: movement.fromStageName,
                                toStage: movement.toStageName,
                                movedBy: movement.movedBy,
                                userId: movement.userId,
                            } as never,
                            orgId,
                        },
                    }).catch(() => null); // non-critical
                }
            }

            // 3. Publish pipeline:movement socket event for kanban real-time updates
            getIO()?.to(`org:${orgId}`).emit("pipeline:movement", {
                movementId: movement.id,
                dealId: movement.dealId,
                fromStageId: movement.fromStageId,
                toStageId: movement.toStageId,
                fromStageName: movement.fromStageName,
                toStageName: movement.toStageName,
                movedBy: movement.movedBy,
                agentId: movement.agentId ?? null,
                userId: movement.userId ?? null,
            });
        } catch (err) {
            console.error("[PipelineAgentBridge] onDealMoved error:", err);
        }
    }
}

// Singleton
export const pipelineAgentBridge = new PipelineAgentBridge();

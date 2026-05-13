/**
 * flow-validator.ts
 *
 * Human-in-the-loop validation layer for agent flow versions.
 * Provides approve / reject / refine operations that are called from
 * agent.service.ts (or directly from routes).
 *
 * Side effects per operation:
 *  - Updates AgentFlowVersion + AIAgent records
 *  - Creates AITrainingData entries from objection/approach patterns
 *  - Emits socket event to the org room
 *  - Creates a TimelineEvent as an in-app notification
 */
import { prisma } from "../../../../lib/prisma.js";
import { AgentRepository } from "../agent.repository.js";
import { getIO } from "../../../../websocket/socket.js";
import type { FlowTemplate, ObjectionResponse, FlowStage } from "./flow-learner.js";

const agentRepo = new AgentRepository();

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ApproveInput {
    flowTemplate?: Record<string, unknown>;
    decisionRules?: Record<string, unknown>;
    notes?: string;
}

export interface RejectInput {
    feedback: string;
    notes?: string;
}

export interface RefineInput {
    /** Partial FlowTemplate fields to merge into the existing version */
    changes: Record<string, unknown>;
    notes?: string;
}

// ---------------------------------------------------------------------------
// FlowValidator class
// ---------------------------------------------------------------------------

export class FlowValidator {
    // -------------------------------------------------------------------------
    // approveFlow
    // -------------------------------------------------------------------------

    async approveFlow(
        agentId: string,
        flowVersionId: string,
        userId: string,
        orgId: string,
        input: ApproveInput = {},
    ): Promise<void> {
        // 1. Permission check
        await this.requireManagerOrAbove(userId, orgId);

        // 2. Load flow version
        const flowVersion = await prisma.agentFlowVersion.findUnique({
            where: { id: flowVersionId },
        });
        if (!flowVersion || flowVersion.agentId !== agentId) {
            throw new Error("Versão de fluxo não encontrada");
        }

        const agent = await agentRepo.findById(agentId, orgId);
        if (!agent) throw new Error("Agente não encontrado");

        const resolvedTemplate = (input.flowTemplate ?? flowVersion.flowTemplate ?? {}) as Record<string, unknown>;
        const resolvedRules = input.decisionRules ?? flowVersion.flowTemplate ?? {};

        // 3. Mark flow version as approved
        await agentRepo.approveFlowVersion(flowVersionId, userId, {
            flowTemplate: resolvedTemplate,
            decisionRules: resolvedRules as Record<string, unknown>,
            notes: input.notes,
        });

        // 4. Update agent to READY / PRODUCTION
        await agentRepo.update(agentId, {
            status: "READY",
            phase: "PRODUCTION",
            flowTemplate: resolvedTemplate,
            learningCompletedAt: new Date(),
        } as never);

        // 5. Extract and store training data from the approved flow
        await this.extractTrainingData(resolvedTemplate as unknown as FlowTemplate, agentId, orgId);

        // 6. Notify
        const message = `Agente "${agent.name}" aprovado e pronto para ativar.`;
        await this.notify(orgId, agentId, agent.name, "agent:flow_approved", message, {
            flowVersionId,
            approvedBy: userId,
        });

        console.info(`[FlowValidator] Agent ${agentId} flow version ${flowVersionId} approved by ${userId}`);
    }

    // -------------------------------------------------------------------------
    // rejectFlow
    // -------------------------------------------------------------------------

    async rejectFlow(
        agentId: string,
        flowVersionId: string,
        input: RejectInput,
        userId: string,
        orgId: string,
    ): Promise<void> {
        await this.requireManagerOrAbove(userId, orgId);

        const flowVersion = await prisma.agentFlowVersion.findUnique({
            where: { id: flowVersionId },
        });
        if (!flowVersion || flowVersion.agentId !== agentId) {
            throw new Error("Versão de fluxo não encontrada");
        }

        const agent = await agentRepo.findById(agentId, orgId);
        if (!agent) throw new Error("Agente não encontrado");

        // Persist feedback in the notes column
        await prisma.agentFlowVersion.update({
            where: { id: flowVersionId },
            data: { notes: `REJEITADO: ${input.feedback}${input.notes ? ` | ${input.notes}` : ""}` },
        });

        // Revert agent
        await agentRepo.update(agentId, { status: "DRAFT", phase: "SETUP" } as never);

        const message = `Fluxo do agente "${agent.name}" rejeitado — revisar configuração. Motivo: ${input.feedback}`;
        await this.notify(orgId, agentId, agent.name, "agent:flow_rejected", message, {
            flowVersionId,
            rejectedBy: userId,
            feedback: input.feedback,
        });

        console.info(`[FlowValidator] Agent ${agentId} flow version ${flowVersionId} rejected by ${userId}`);
    }

    // -------------------------------------------------------------------------
    // refineFlow
    // -------------------------------------------------------------------------

    async refineFlow(
        agentId: string,
        flowVersionId: string,
        input: RefineInput,
        userId: string,
        orgId: string,
    ): Promise<void> {
        await this.requireManagerOrAbove(userId, orgId);

        const flowVersion = await prisma.agentFlowVersion.findUnique({
            where: { id: flowVersionId },
        });
        if (!flowVersion || flowVersion.agentId !== agentId) {
            throw new Error("Versão de fluxo não encontrada");
        }

        // Merge changes into the existing flow template
        const base = (flowVersion.flowTemplate ?? {}) as Record<string, unknown>;
        const merged = deepMerge(base, input.changes);

        // Create a new version (source = 'manual refinement')
        const latest = await agentRepo.getLatestFlowVersion(agentId);
        const nextVersion = (latest?.version ?? flowVersion.version) + 1;

        const newVersion = await agentRepo.createFlowVersion({
            agentId,
            version: nextVersion,
            flowTemplate: merged,
            notes: `Refinamento manual v${nextVersion}${input.notes ? `: ${input.notes}` : ""}. Baseado em ${flowVersionId}`,
        });

        // Auto-approve the refined version
        await this.approveFlow(agentId, newVersion.id, userId, orgId, {
            flowTemplate: merged,
            notes: `Refinado e aprovado: ${input.notes ?? ""}`,
        });

        console.info(`[FlowValidator] Agent ${agentId} flow refined to version ${nextVersion} by ${userId}`);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private async requireManagerOrAbove(userId: string, orgId: string): Promise<void> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, orgId: true },
        });
        if (!user) throw new Error("Usuário não encontrado");
        if (user.orgId !== orgId) throw new Error("Usuário não pertence a esta organização");

        const allowed = ["SUPER_ADMIN", "ADMIN", "MANAGER"] as const;
        if (!allowed.includes(user.role as (typeof allowed)[number])) {
            throw new Error("Permissão insuficiente. Requer ADMIN ou MANAGER.");
        }
    }

    private async extractTrainingData(
        flow: FlowTemplate,
        agentId: string,
        orgId: string,
    ): Promise<void> {
        if (!flow) return;

        const records: Array<{
            type: "OBJECTION_RESPONSE" | "SALES_APPROACH";
            input: string;
            output: string;
            isValidated: boolean;
            orgId: string;
        }> = [];

        // Objection responses
        const objections = Array.isArray(flow.objectionPlaybook) ? flow.objectionPlaybook : [];
        for (const obj of objections as ObjectionResponse[]) {
            if (obj.pattern && obj.bestResponse) {
                records.push({
                    type: "OBJECTION_RESPONSE",
                    input: obj.pattern,
                    output: obj.bestResponse,
                    isValidated: true,
                    orgId,
                });
            }
        }

        // Sales approach patterns (derived from stage questions)
        const stages = Array.isArray(flow.stages) ? flow.stages : [];
        for (const stage of stages as FlowStage[]) {
            if (!stage.questionsToAsk?.length) continue;
            records.push({
                type: "SALES_APPROACH",
                input: `Etapa: ${stage.name}`,
                output: stage.questionsToAsk.join(" | "),
                isValidated: true,
                orgId,
            });
        }

        if (records.length === 0) return;

        // Create training data records, skipping duplicates (best-effort)
        await Promise.allSettled(
            records.map(async (r) => {
                const existing = await prisma.aITrainingData.findFirst({
                    where: { type: r.type, input: r.input, orgId: r.orgId },
                    select: { id: true },
                });
                if (existing) {
                    return prisma.aITrainingData.update({
                        where: { id: existing.id },
                        data: { output: r.output, isValidated: true },
                    });
                }
                return prisma.aITrainingData.create({ data: r });
            }),
        );

        console.info(`[FlowValidator] Saved ${records.length} training data records for agent ${agentId}`);
    }

    private async notify(
        orgId: string,
        agentId: string,
        agentName: string,
        event: string,
        message: string,
        meta: Record<string, unknown>,
    ): Promise<void> {
        // Socket.io broadcast
        try {
            const io = getIO();
            if (io) {
                io.to(`org:${orgId}`).emit(event, {
                    orgId,
                    agentId,
                    agentName,
                    message,
                    timestamp: new Date().toISOString(),
                    ...meta,
                });
            }
        } catch {
            // Non-fatal
        }

        // In-app notification via TimelineEvent (best-effort)
        try {
            await prisma.timelineEvent.create({
                data: {
                    type: "AGENT_TOOL_CALL",
                    title: message,
                    description: JSON.stringify(meta),
                    metadata: { agentId, event, ...meta },
                    contactId: "system",
                    orgId,
                },
            });
        } catch {
            // Non-fatal
        }
    }
}

// ---------------------------------------------------------------------------
// Deep merge utility
// ---------------------------------------------------------------------------

function deepMerge(
    base: Record<string, unknown>,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    const result = { ...base };
    for (const key of Object.keys(patch)) {
        const pv = patch[key];
        const bv = base[key];
        if (
            typeof pv === "object" &&
            pv !== null &&
            !Array.isArray(pv) &&
            typeof bv === "object" &&
            bv !== null &&
            !Array.isArray(bv)
        ) {
            result[key] = deepMerge(bv as Record<string, unknown>, pv as Record<string, unknown>);
        } else {
            result[key] = pv;
        }
    }
    return result;
}

// Singleton
export const flowValidator = new FlowValidator();

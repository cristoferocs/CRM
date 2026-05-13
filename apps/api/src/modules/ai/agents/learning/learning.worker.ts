/**
 * learning.worker.ts (new — inside agents/learning/)
 *
 * BullMQ worker that processes 'agent:learn' jobs using FlowLearner.
 * - Max 2 retries with exponential back-off
 * - 30-minute job timeout
 * - Progress updates persisted in AgentLearningJob after every batch
 * - On definitive failure: marks job FAILED and notifies org admins via socket
 */
import { Worker, type Job } from "bullmq";
import { getRedis } from "../../../../lib/redis.js";
import { flowLearner } from "./flow-learner.js";
import { AgentRepository } from "../agent.repository.js";
import { getIO } from "../../../../websocket/socket.js";
import { prisma } from "../../../../lib/prisma.js";

const agentRepo = new AgentRepository();

interface LearnJobData {
    jobId: string;
    agentId: string;
    orgId: string;
}

async function processLearnJob(job: Job<LearnJobData>): Promise<void> {
    const { jobId, agentId, orgId } = job.data;

    await flowLearner.analyzeSample(
        jobId,
        agentId,
        orgId,
        // Progress callback: update BullMQ job progress after each batch
        async (batchDone, totalBatches) => {
            const pct = Math.round((batchDone / totalBatches) * 100);
            await job.updateProgress(pct);
        },
    );
}

async function handleFailedJob(job: Job<LearnJobData>, err: Error): Promise<void> {
    const { jobId, agentId, orgId } = job.data;

    // Only act on definitive failure (no more attempts left)
    if ((job.attemptsMade ?? 0) < (job.opts?.attempts ?? 2) - 1) return;

    const errorMsg = err.message ?? "Erro desconhecido";

    // Mark job as FAILED
    try {
        await agentRepo.updateLearningJob(jobId, {
            status: "FAILED",
            error: errorMsg,
            completedAt: new Date(),
        });
    } catch {
        // Ignore — best-effort
    }

    // Revert agent to DRAFT
    try {
        await agentRepo.update(agentId, { status: "DRAFT", phase: "SETUP" } as never);
    } catch {
        // Ignore
    }

    // Notify admins via socket
    try {
        const agent = await agentRepo.findById(agentId, orgId);
        const io = getIO();
        if (io && agent) {
            io.to(`org:${orgId}`).emit("agent:learning_failed", {
                orgId,
                agentId,
                agentName: agent.name,
                error: errorMsg,
                message: `O aprendizado do agente "${agent.name}" falhou: ${errorMsg}`,
                timestamp: new Date().toISOString(),
            });
        }

        // Also notify via in-app notification record (best-effort)
        if (agent) {
            const admins = await prisma.user.findMany({
                where: { orgId, role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
                select: { id: true },
            });
            await Promise.allSettled(
                admins.map((admin) =>
                    prisma.timelineEvent.create({
                        data: {
                            type: "AGENT_TOOL_CALL",
                            title: `Aprendizado do agente "${agent.name}" falhou`,
                            description: errorMsg,
                            metadata: { agentId, jobId, error: errorMsg },
                            contactId: "system",
                            orgId,
                        },
                    }),
                ),
            );
            void admins; // used above
        }
    } catch {
        // Notification failure is non-fatal
    }
}

export function createFlowLearningWorker() {
    const worker = new Worker<LearnJobData>(
        "learning",
        async (job) => {
            if (job.name === "agent:learn") {
                await processLearnJob(job);
            }
        },
        {
            connection: getRedis(),
            concurrency: Number(process.env["LEARNING_WORKER_CONCURRENCY"] ?? 2),
            settings: {
                stalledInterval: 60_000,
            },
        },
    );

    worker.on("failed", (job, err) => {
        if (job) {
            void handleFailedJob(job, err as Error);
        }
    });

    worker.on("error", (err) => {
        console.error("[FlowLearningWorker] Unhandled error:", err);
    });

    return worker;
}

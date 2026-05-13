/**
 * flow-learner.ts
 *
 * Orchestrates the automatic learning pipeline for super agents.
 * Analyses real conversations, identifies patterns by batch, consolidates
 * them into a structured FlowTemplate, generates a system prompt and then
 * awaits human validation before the agent can go to production.
 *
 * Never depends on Fastify — safe to import from workers.
 */
import { prisma } from "../../../../lib/prisma.js";
import { getAIProvider } from "../../ai.factory.js";
import { AgentRepository } from "../agent.repository.js";
import { getIO } from "../../../../websocket/socket.js";
import { queues } from "../../../../queue/queues.js";

const agentRepo = new AgentRepository();

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FlowStage {
    id: string;
    name: string;
    description: string;
    order: number;
    entryConditions: string[];
    keyActions: string[];
    questionsToAsk: string[];
    dataToCollect: string[];
    exitConditions: string[];
    maxMessages: number;
    handoffConditions: string[];
}

export interface DataPoint {
    field: string;
    question: string;
    required: boolean;
    stage: string;
}

export interface ObjectionResponse {
    pattern: string;
    frequency: number;
    bestResponse: string;
}

export interface DecisionNode {
    condition: string;
    trueAction: string;
    falseAction: string;
}

export interface FlowTemplate {
    version: number;
    agentType: string;
    stages: FlowStage[];
    decisionTree: DecisionNode[];
    requiredDataPoints: DataPoint[];
    objectionPlaybook: ObjectionResponse[];
    buyingSignals: string[];
    riskSignals: string[];
    metadata: {
        learnedFrom: number;
        avgSuccessRate: number;
        confidence: number;
        generatedAt: string;
    };
}

// Intermediate shape returned by the AI per batch
interface BatchAnalysis {
    stages: Array<{
        name: string;
        description: string;
        avgMessages: number;
        keyQuestions: string[];
        successSignals: string[];
    }>;
    dataPoints: Array<{
        field: string;
        question: string;
        required: boolean;
        stage: string;
    }>;
    objections: Array<{
        pattern: string;
        frequency: number;
        bestResponse: string;
    }>;
    buyingSignals: string[];
    riskSignals: string[];
    avgConversationLength: number;
    successRate: number;
}

// ---------------------------------------------------------------------------
// FlowLearner class
// ---------------------------------------------------------------------------

export class FlowLearner {
    // -------------------------------------------------------------------------
    // startLearning — called from service/route
    // -------------------------------------------------------------------------

    async startLearning(agentId: string, orgId: string): Promise<string> {
        // 1. Move to LEARNING status
        await agentRepo.update(agentId, { status: "LEARNING", phase: "LEARNING" } as never);

        // 2. Create AgentLearningJob
        const job = await agentRepo.createLearningJob({ agentId, orgId, conversationIds: [] });

        // 3. Enqueue BullMQ job
        await queues.learning().add(
            "agent:learn",
            { jobId: job.id, agentId, orgId },
            {
                attempts: 2,
                backoff: { type: "exponential", delay: 15_000 },
                timeout: 30 * 60 * 1_000, // 30 min
            },
        );

        return job.id;
    }

    // -------------------------------------------------------------------------
    // analyzeSample — called by the BullMQ worker
    // -------------------------------------------------------------------------

    async analyzeSample(
        jobId: string,
        agentId: string,
        orgId: string,
        onProgress?: (batchDone: number, totalBatches: number) => Promise<void>,
    ): Promise<void> {
        await agentRepo.updateLearningJob(jobId, { status: "RUNNING", startedAt: new Date() });

        const agent = await agentRepo.findById(agentId, orgId);
        if (!agent) {
            await this.failJob(jobId, "Agente não encontrado");
            return;
        }

        const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { name: true },
        });

        // -----------------------------------------------------------------------
        // PASSO 1 — COLETA DE DADOS
        // -----------------------------------------------------------------------
        let conversationIds: string[];
        try {
            conversationIds = await this.collectConversations(agent, orgId);
        } catch (err) {
            await this.failJob(jobId, `Coleta de conversas falhou: ${errorMessage(err)}`);
            await agentRepo.update(agentId, { status: "DRAFT", phase: "SETUP" } as never);
            return;
        }

        if (conversationIds.length < agent.minimumLearningSample) {
            await this.failJob(
                jobId,
                `Amostra insuficiente: ${conversationIds.length} conversas (mínimo: ${agent.minimumLearningSample})`,
            );
            await agentRepo.update(agentId, { status: "DRAFT", phase: "SETUP" } as never);
            return;
        }

        // Persist collected IDs in the job record
        await prisma.agentLearningJob.update({
            where: { id: jobId },
            data: { conversationIds },
        });

        // -----------------------------------------------------------------------
        // PASSO 2 — ANÁLISE POR LOTES
        // -----------------------------------------------------------------------
        const BATCH_SIZE = 10;
        const batches = chunk(conversationIds, BATCH_SIZE);
        const batchResults: BatchAnalysis[] = [];
        const provider = getAIProvider((agent.provider ?? "OPENAI").toLowerCase());

        for (let i = 0; i < batches.length; i++) {
            const batchIds = batches[i]!;
            let batchAnalysis: BatchAnalysis | null = null;

            try {
                const summaries = await this.loadConversationSummaries(batchIds, orgId);
                const prompt = this.buildBatchAnalysisPrompt(agent.type, agent.goal, summaries);

                const response = await provider.chat(
                    [{ role: "user", content: prompt }],
                    { temperature: 0.2, maxTokens: 4096 },
                );

                batchAnalysis = this.parseBatchAnalysis(response.content);
            } catch (err) {
                // Non-fatal: skip bad batch, continue
                console.warn(`[FlowLearner] Batch ${i + 1} failed: ${errorMessage(err)}`);
            }

            if (batchAnalysis) {
                batchResults.push(batchAnalysis);
            }

            // Report progress
            await agentRepo.updateLearningJob(jobId, {
                analyzedCount: Math.min((i + 1) * BATCH_SIZE, conversationIds.length),
            });
            await onProgress?.(i + 1, batches.length);
        }

        if (batchResults.length === 0) {
            await this.failJob(jobId, "Todos os lotes de análise falharam");
            await agentRepo.update(agentId, { status: "DRAFT", phase: "SETUP" } as never);
            return;
        }

        // -----------------------------------------------------------------------
        // PASSO 3 — CONSOLIDAÇÃO
        // -----------------------------------------------------------------------
        const flowTemplate = this.consolidate(agent.type, batchResults, conversationIds.length);

        // -----------------------------------------------------------------------
        // PASSO 4 — GERAR SYSTEM PROMPT AUTOMÁTICO
        // -----------------------------------------------------------------------
        const systemPrompt = this.generateSystemPrompt(agent, org?.name ?? "sua empresa", flowTemplate);

        // -----------------------------------------------------------------------
        // PASSO 5 — SALVAR E NOTIFICAR
        // -----------------------------------------------------------------------
        const latestVersion = await agentRepo.getLatestFlowVersion(agentId);
        const nextVersion = (latestVersion?.version ?? 0) + 1;

        await agentRepo.createFlowVersion({
            agentId,
            version: nextVersion,
            flowTemplate: flowTemplate as unknown as Record<string, unknown>,
            notes: `Aprendido de ${conversationIds.length} conversas. Confiança: ${(flowTemplate.metadata.confidence * 100).toFixed(0)}%`,
        });

        await agentRepo.update(agentId, {
            status: "REVIEW",
            phase: "VALIDATION",
            flowTemplate: flowTemplate as unknown as Record<string, unknown>,
            systemPrompt,
            requiredDataPoints: flowTemplate.requiredDataPoints.map((dp) => dp.field),
            learningCompletedAt: new Date(),
            learnedFromCount: { increment: conversationIds.length },
        } as never);

        await agentRepo.updateLearningJob(jobId, {
            status: "DONE",
            analyzedCount: conversationIds.length,
            result: flowTemplate as unknown as Record<string, unknown>,
            completedAt: new Date(),
        });

        // Notify admins
        await this.notifyAdmins(orgId, agent.name, "learning_complete");

        console.info(
            `[FlowLearner] Job ${jobId}: analysed ${conversationIds.length} conversations ` +
            `(${batchResults.length} batches) for agent "${agent.name}" → REVIEW`,
        );
    }

    // -------------------------------------------------------------------------
    // PASSO 1 — COLETA: per-type query
    // -------------------------------------------------------------------------

    private async collectConversations(
        agent: {
            id: string;
            type: string;
            minimumLearningSample: number;
            learningConfig: unknown;
        },
        orgId: string,
    ): Promise<string[]> {
        const since = new Date();
        since.setDate(since.getDate() - 90);
        const MAX = 200;
        const min = agent.minimumLearningSample;

        switch (agent.type) {
            case "SALES": {
                // Conversations with WON deals, ordered by deal value DESC
                const rows = await prisma.conversation.findMany({
                    where: {
                        orgId,
                        contact: {
                            deals: {
                                some: {
                                    stage: { isWon: true },
                                    closedAt: { gte: since },
                                    orgId,
                                },
                            },
                        },
                    },
                    orderBy: {
                        contact: {
                            deals: { _count: "desc" },
                        },
                    },
                    take: MAX,
                    select: { id: true },
                });
                return rows.map((r) => r.id);
            }

            case "SUPPORT": {
                const rows = await prisma.conversation.findMany({
                    where: {
                        orgId,
                        status: "RESOLVED",
                        createdAt: { gte: since },
                        aiSessions: { some: { goalAchieved: true } },
                    },
                    orderBy: { lastMessageAt: "desc" },
                    take: MAX,
                    select: { id: true },
                });
                // Fall back to all resolved if not enough goal-achieved sessions
                if (rows.length < min) {
                    const fallback = await prisma.conversation.findMany({
                        where: { orgId, status: "RESOLVED", createdAt: { gte: since } },
                        orderBy: { lastMessageAt: "desc" },
                        take: MAX,
                        select: { id: true },
                    });
                    return fallback.map((r) => r.id);
                }
                return rows.map((r) => r.id);
            }

            case "SCHEDULER": {
                const activitiesWithConvs = await prisma.activity.findMany({
                    where: {
                        orgId,
                        type: "MEETING",
                        createdAt: { gte: since },
                        contact: { conversations: { some: { orgId } } },
                    },
                    take: MAX,
                    select: {
                        contact: {
                            select: {
                                conversations: {
                                    where: { orgId },
                                    orderBy: { lastMessageAt: "desc" },
                                    take: 1,
                                    select: { id: true },
                                },
                            },
                        },
                    },
                });
                const ids = activitiesWithConvs
                    .flatMap((a) => a.contact?.conversations.map((c) => c.id) ?? [])
                    .filter(Boolean);
                return [...new Set(ids)].slice(0, MAX);
            }

            case "QUALIFICATION": {
                // Leads that became Customers
                const rows = await prisma.conversation.findMany({
                    where: {
                        orgId,
                        createdAt: { gte: since },
                        contact: { type: "CUSTOMER" },
                    },
                    orderBy: { lastMessageAt: "desc" },
                    take: MAX,
                    select: { id: true },
                });
                return rows.map((r) => r.id);
            }

            default: {
                // CUSTOM — use learningConfig.conversationFilter if present
                const cfg = (agent.learningConfig ?? {}) as Record<string, unknown>;
                const filter = cfg["conversationFilter"] as Record<string, unknown> | undefined;
                const where: Record<string, unknown> = {
                    orgId,
                    status: "RESOLVED",
                    createdAt: { gte: since },
                    ...(filter ?? {}),
                };
                const rows = await prisma.conversation.findMany({
                    where: where as never,
                    orderBy: { lastMessageAt: "desc" },
                    take: MAX,
                    select: { id: true },
                });
                return rows.map((r) => r.id);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Load conversation messages for a batch
    // -------------------------------------------------------------------------

    private async loadConversationSummaries(ids: string[], orgId: string) {
        const convs = await prisma.conversation.findMany({
            where: { id: { in: ids }, orgId },
            select: {
                id: true,
                channel: true,
                status: true,
                messages: {
                    orderBy: { sentAt: "asc" },
                    take: 40,
                    select: { content: true, direction: true },
                },
            },
        });

        return convs.map((c) => ({
            id: c.id,
            messages: c.messages.map((m) => ({
                role: (m.direction === "INBOUND" ? "Cliente" : "Agente") as "Cliente" | "Agente",
                content: m.content,
            })),
            outcome: c.status === "RESOLVED" ? "sucesso" : c.status,
        }));
    }

    // -------------------------------------------------------------------------
    // Build prompt per batch
    // -------------------------------------------------------------------------

    private buildBatchAnalysisPrompt(
        agentType: string,
        goal: string,
        summaries: Array<{ id: string; messages: Array<{ role: string; content: string }>; outcome: string }>,
    ): string {
        const transcripts = summaries
            .map((s, i) => {
                const lines = s.messages
                    .slice(0, 30)
                    .map((m) => `  ${m.role}: ${m.content.slice(0, 300)}`)
                    .join("\n");
                return `--- Conversa ${i + 1} (resultado: ${s.outcome}) ---\n${lines}`;
            })
            .join("\n\n");

        return `Analise estas ${summaries.length} conversas de ${agentType} bem-sucedidas e identifique:
1. ETAPAS: quais são as fases distintas da conversa (ex: abertura, qualificação, proposta, fechamento)
2. PERGUNTAS-CHAVE: quais perguntas o vendedor/atendente sempre faz em cada etapa
3. DADOS COLETADOS: quais informações o vendedor coletou antes de avançar
4. OBJEÇÕES COMUNS: quais objeções aparecem e como foram tratadas com sucesso
5. SINAIS DE COMPRA: quais frases/comportamentos indicam que o cliente está pronto
6. SINAIS DE RISCO: o que indica que vai perder ou precisar de humano
7. TIMING: quanto tempo médio em cada etapa, quantas mensagens

Objetivo do agente: ${goal}

${transcripts}

Retorne APENAS JSON com esta estrutura (sem markdown extra):
{
  "stages": [{ "name": "", "description": "", "avgMessages": 0, "keyQuestions": [], "successSignals": [] }],
  "dataPoints": [{ "field": "", "question": "", "required": true, "stage": "" }],
  "objections": [{ "pattern": "", "frequency": 0, "bestResponse": "" }],
  "buyingSignals": [],
  "riskSignals": [],
  "avgConversationLength": 0,
  "successRate": 0
}`;
    }

    // -------------------------------------------------------------------------
    // Parse AI batch response
    // -------------------------------------------------------------------------

    private parseBatchAnalysis(raw: string): BatchAnalysis | null {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start === -1 || end === -1) return null;
        try {
            return JSON.parse(raw.slice(start, end + 1)) as BatchAnalysis;
        } catch {
            return null;
        }
    }

    // -------------------------------------------------------------------------
    // PASSO 3 — CONSOLIDAÇÃO
    // -------------------------------------------------------------------------

    private consolidate(
        agentType: string,
        batches: BatchAnalysis[],
        totalConversations: number,
    ): FlowTemplate {
        const totalBatches = batches.length;
        const CONFIDENCE_THRESHOLD = 0.6;

        // -- Stages: deduplicate by name, keep those appearing in ≥60% of batches
        const stageFreq = new Map<string, { data: BatchAnalysis["stages"][0]; count: number }>();
        for (const batch of batches) {
            for (const stage of batch.stages) {
                const key = stage.name.toLowerCase().trim();
                const existing = stageFreq.get(key);
                if (existing) {
                    existing.count++;
                    existing.data.keyQuestions = mergeUnique(existing.data.keyQuestions, stage.keyQuestions);
                    existing.data.successSignals = mergeUnique(existing.data.successSignals, stage.successSignals);
                } else {
                    stageFreq.set(key, { data: { ...stage }, count: 1 });
                }
            }
        }

        const confirmedStages: FlowStage[] = [...stageFreq.entries()]
            .filter(([, v]) => v.count / totalBatches >= CONFIDENCE_THRESHOLD)
            .map(([, v], idx) => ({
                id: slugify(v.data.name),
                name: v.data.name,
                description: v.data.description,
                order: idx + 1,
                entryConditions: [],
                keyActions: [],
                questionsToAsk: v.data.keyQuestions,
                dataToCollect: [],
                exitConditions: v.data.successSignals,
                maxMessages: Math.round(v.data.avgMessages * 1.5) || 10,
                handoffConditions: [],
            }));

        // -- DataPoints
        const dpFreq = new Map<string, { data: BatchAnalysis["dataPoints"][0]; count: number }>();
        for (const batch of batches) {
            for (const dp of batch.dataPoints) {
                const key = dp.field.toLowerCase().trim();
                const existing = dpFreq.get(key);
                if (existing) {
                    existing.count++;
                } else {
                    dpFreq.set(key, { data: { ...dp }, count: 1 });
                }
            }
        }
        const confirmedDataPoints: DataPoint[] = [...dpFreq.entries()]
            .filter(([, v]) => v.count / totalBatches >= CONFIDENCE_THRESHOLD)
            .map(([, v]) => v.data);

        // -- Objections
        const objFreq = new Map<string, { data: BatchAnalysis["objections"][0]; count: number }>();
        for (const batch of batches) {
            for (const obj of batch.objections) {
                const key = obj.pattern.toLowerCase().trim();
                const existing = objFreq.get(key);
                if (existing) {
                    existing.count++;
                    // Keep the best response (by longest response as heuristic)
                    if (obj.bestResponse.length > existing.data.bestResponse.length) {
                        existing.data.bestResponse = obj.bestResponse;
                    }
                } else {
                    objFreq.set(key, { data: { ...obj }, count: 1 });
                }
            }
        }
        const confirmedObjections: ObjectionResponse[] = [...objFreq.entries()]
            .filter(([, v]) => v.count / totalBatches >= CONFIDENCE_THRESHOLD)
            .map(([, v]) => ({
                pattern: v.data.pattern,
                frequency: v.count / totalBatches,
                bestResponse: v.data.bestResponse,
            }));

        // -- Signals
        const buyingSignals = consolidateSignals(
            batches.map((b) => b.buyingSignals),
            totalBatches,
            CONFIDENCE_THRESHOLD,
        );
        const riskSignals = consolidateSignals(
            batches.map((b) => b.riskSignals),
            totalBatches,
            CONFIDENCE_THRESHOLD,
        );

        // -- Avg metrics
        const avgSuccessRate =
            batches.reduce((sum, b) => sum + (b.successRate ?? 0), 0) / totalBatches;

        // -- Confidence: proportion of confirmed patterns over raw total
        const rawItems =
            [...stageFreq.values()].length +
            [...dpFreq.values()].length +
            [...objFreq.values()].length;
        const confirmedItems = confirmedStages.length + confirmedDataPoints.length + confirmedObjections.length;
        const confidence = rawItems > 0 ? confirmedItems / rawItems : 0;

        return {
            version: 1,
            agentType,
            stages: confirmedStages,
            decisionTree: [],
            requiredDataPoints: confirmedDataPoints,
            objectionPlaybook: confirmedObjections,
            buyingSignals,
            riskSignals,
            metadata: {
                learnedFrom: totalConversations,
                avgSuccessRate,
                confidence,
                generatedAt: new Date().toISOString(),
            },
        };
    }

    // -------------------------------------------------------------------------
    // PASSO 4 — GERAR SYSTEM PROMPT
    // -------------------------------------------------------------------------

    private generateSystemPrompt(
        agent: { name: string; personality: unknown; goal: string; type: string },
        orgName: string,
        flow: FlowTemplate,
    ): string {
        const personality = (agent.personality as Record<string, unknown>) ?? {};
        const role = (personality["role"] as string) ?? "assistente";
        const tone = (personality["tone"] as string) ?? "profissional e amigável";

        const stagesBlock = flow.stages
            .sort((a, b) => a.order - b.order)
            .map((s) => {
                const lines = [
                    `### Etapa ${s.order}: ${s.name}`,
                    `${s.description}`,
                    s.questionsToAsk.length > 0
                        ? `Perguntas: ${s.questionsToAsk.join(" | ")}`
                        : "",
                    s.exitConditions.length > 0
                        ? `Avance quando: ${s.exitConditions.join("; ")}`
                        : "",
                    s.handoffConditions.length > 0
                        ? `Escale para humano se: ${s.handoffConditions.join("; ")}`
                        : "",
                ];
                return lines.filter(Boolean).join("\n");
            })
            .join("\n\n");

        const dataBlock =
            flow.requiredDataPoints.length > 0
                ? flow.requiredDataPoints
                    .map((dp) => `- ${dp.field}${dp.required ? " (obrigatório)" : ""}: "${dp.question}"`)
                    .join("\n")
                : "Nenhum dado específico definido.";

        const objectionBlock =
            flow.objectionPlaybook.length > 0
                ? flow.objectionPlaybook
                    .map((o) => `• "${o.pattern}" → ${o.bestResponse}`)
                    .join("\n")
                : "Sem playbook de objeções definido.";

        const buyingBlock =
            flow.buyingSignals.length > 0
                ? flow.buyingSignals.map((s) => `• ${s}`).join("\n")
                : "Nenhum sinal identificado.";

        const riskBlock =
            flow.riskSignals.length > 0
                ? flow.riskSignals.map((s) => `• ${s}`).join("\n")
                : "Nenhum sinal de risco identificado.";

        return `Você é ${agent.name}, ${role} da ${orgName}.
Seu tom: ${tone}.
Seu objetivo: ${agent.goal}

## FLUXO DE TRABALHO

${stagesBlock}

## DADOS QUE VOCÊ DEVE COLETAR

${dataBlock}

## COMO LIDAR COM OBJEÇÕES

${objectionBlock}

## SINAIS DE QUE O CLIENTE ESTÁ PRONTO

${buyingBlock}

## QUANDO CHAMAR UM HUMANO

${riskBlock}

## REGRAS GERAIS
- Nunca invente informações sobre produtos ou preços.
- Sempre confirme os dados coletados antes de avançar de etapa.
- Seja conciso: máximo 3 parágrafos por resposta.
- Se não souber responder, diga que vai verificar com a equipe.`;
    }

    // -------------------------------------------------------------------------
    // Notify org admins via socket
    // -------------------------------------------------------------------------

    private async notifyAdmins(orgId: string, agentName: string, event: string): Promise<void> {
        try {
            const io = getIO();
            if (io) {
                io.to(`org:${orgId}`).emit("agent:learning_complete", {
                    orgId,
                    agentName,
                    event,
                    message: `O agente "${agentName}" completou o aprendizado e aguarda sua revisão.`,
                    timestamp: new Date().toISOString(),
                });
            }
        } catch {
            // Notification failure is non-fatal
        }
    }

    // -------------------------------------------------------------------------
    // Fail a job and log the error
    // -------------------------------------------------------------------------

    private async failJob(jobId: string, error: string): Promise<void> {
        await agentRepo.updateLearningJob(jobId, {
            status: "FAILED",
            error,
            completedAt: new Date(),
        });
        console.error(`[FlowLearner] Job ${jobId} failed: ${error}`);
    }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

function mergeUnique(a: string[], b: string[]): string[] {
    return [...new Set([...a, ...b])];
}

function consolidateSignals(
    batchSignals: string[][],
    totalBatches: number,
    threshold: number,
): string[] {
    const freq = new Map<string, number>();
    for (const signals of batchSignals) {
        for (const s of signals) {
            const key = s.toLowerCase().trim();
            freq.set(key, (freq.get(key) ?? 0) + 1);
        }
    }
    return [...freq.entries()]
        .filter(([, count]) => count / totalBatches >= threshold)
        .map(([key]) => key);
}

function slugify(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

// Singleton
export const flowLearner = new FlowLearner();

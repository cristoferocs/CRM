/**
 * continuous-learner.ts
 *
 * Implements automatic learning from individual production sessions.
 * Called automatically when an AIAgentSession ends (ENDED or HANDOFF).
 *
 * Two entry-points:
 *   - learnFromSession(sessionId, orgId)  — per-session micro-learning
 *   - weeklyRefinement(agentId, orgId)    — weekly aggregate analysis
 */
import { prisma } from "../../../../lib/prisma.js";
import { getAIProvider } from "../../ai.factory.js";
import { AgentRepository } from "../agent.repository.js";
import { getIO } from "../../../../websocket/socket.js";

const agentRepo = new AgentRepository();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HandoffCause =
    | "RISK_SIGNAL"
    | "TURN_COUNT_EXCEEDED"
    | "TOOL_FAILURE"
    | "NEGATIVE_INTENT"
    | "UNKNOWN";

interface HandoffAnalysis {
    cause: HandoffCause;
    avoidable: boolean;
    suggestion: string | null;
    newRuleCandidate: Record<string, unknown> | null;
}

export interface AgentWeeklyReport {
    agentId: string;
    agentName: string;
    week: string; // ISO date of the Monday starting that week
    sessionsTotal: number;
    sessionsCompleted: number;
    sessionsHandoff: number;
    autonomyRate: number;
    avgTurns: number;
    avgResponseTime: number | null; // seconds
    topObjections: string[];
    topSuccessPatterns: string[];
    suggestedImprovements: string[];
}

// Internal session shape returned by Prisma include
type TurnRow = {
    role: string;
    content: string;
    toolName: string | null;
    toolResult: string | null;
};

type FullSession = NonNullable<Awaited<ReturnType<typeof prisma.aIAgentSession.findFirst>>> & {
    agent: NonNullable<Awaited<ReturnType<typeof prisma.aIAgent.findFirst>>>;
    turns: TurnRow[];
};

// ---------------------------------------------------------------------------
// ContinuousLearner
// ---------------------------------------------------------------------------

export class ContinuousLearner {
    // =========================================================================
    // learnFromSession
    // Called when a session ends (status = ENDED/HANDOFF from super-agent runner)
    // =========================================================================

    async learnFromSession(sessionId: string, orgId: string): Promise<void> {
        const session = (await prisma.aIAgentSession.findFirst({
            where: { id: sessionId, orgId },
            include: {
                agent: true,
                turns: {
                    orderBy: { createdAt: "asc" },
                    select: {
                        role: true,
                        content: true,
                        toolName: true,
                        toolResult: true,
                    },
                },
            },
        })) as FullSession | null;

        if (!session) {
            console.warn(`[ContinuousLearner] Session ${sessionId} not found`);
            return;
        }

        if (session.goalAchieved === true) {
            await this.learnFromSuccess(session, orgId);
        } else if (session.status === "HANDOFF") {
            await this.learnFromHandoff(session, orgId);
        }
    }

    // =========================================================================
    // COMPLETED path — extract success patterns
    // =========================================================================

    private async learnFromSuccess(session: FullSession, orgId: string): Promise<void> {
        const agent = session.agent;
        const turns = session.turns;

        // Turning point: first user message with buying-intent keywords
        const positiveSignals = [
            "vou",
            "fechado",
            "confirmado",
            "aceito",
            "quero",
            "perfeito",
            "ótimo",
            "combinado",
            "sim",
            "topo",
            "topei",
            "fechou",
        ];
        let turningPointIdx: number | null = null;
        for (let i = 0; i < turns.length; i++) {
            if (turns[i]!.role === "user") {
                const lower = turns[i]!.content.toLowerCase();
                if (positiveSignals.some((s) => lower.includes(s))) {
                    turningPointIdx = i;
                    break;
                }
            }
        }

        // Decisive tools — successful tool calls (no error in result)
        const toolFreq = new Map<string, number>();
        for (const t of turns) {
            if (t.role === "tool" && t.toolName && !(t.toolResult ?? "").toLowerCase().includes("erro")) {
                toolFreq.set(t.toolName, (toolFreq.get(t.toolName) ?? 0) + 1);
            }
        }
        const decisiveTools = [...toolFreq.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([tool]) => tool);

        // Key questions from assistant turns (sentences ending with ?)
        const keyQuestions = turns
            .filter((t) => t.role === "assistant" && t.content.includes("?"))
            .flatMap((t) =>
                t.content
                    .split(/[.!]/)
                    .filter((s) => s.includes("?"))
                    .map((s) => s.trim()),
            )
            .filter(Boolean)
            .slice(0, 5);

        // Build training record
        const contextInput = [
            `Tipo: ${agent.type}`,
            `Objetivo: ${agent.goal.slice(0, 120)}`,
            `Intent: ${session.intent ?? "não detectado"}`,
            `Etapa: ${session.currentStep ?? "N/A"}`,
            `Turnos: ${session.turnCount}`,
        ].join(" | ");

        const successOutput = [
            `Concluído em ${session.turnCount} turnos`,
            turningPointIdx !== null ? `Turning point no turno ${turningPointIdx + 1}` : null,
            decisiveTools.length > 0 ? `Tools decisivas: ${decisiveTools.join(", ")}` : null,
            keyQuestions.length > 0 ? `Perguntas-chave: ${keyQuestions.join(" | ")}` : null,
        ]
            .filter(Boolean)
            .join(". ");

        const trainingType: "SALES_APPROACH" | "FAQ" = [
            "SALES",
            "QUALIFICATION",
            "COLLECTIONS",
        ].includes(agent.type)
            ? "SALES_APPROACH"
            : "FAQ";

        await prisma.aITrainingData.create({
            data: { type: trainingType, input: contextInput, output: successOutput, isValidated: false, orgId },
        });
    }

    // =========================================================================
    // HANDOFF path — analyse why and suggest improvements
    // =========================================================================

    private async learnFromHandoff(session: FullSession, orgId: string): Promise<void> {
        const agent = session.agent;
        const analysis = this.analyzeHandoffCause(session);

        // AI-assisted coaching content
        const coachingContent = await this.generateCoachingInsight(session, analysis);

        await prisma.aIInsight.create({
            data: {
                type: "COACHING",
                title: `Agente ${agent.name}: handoff analisado`,
                content: coachingContent,
                confidence: 0.7,
                sourceConversationIds: [session.conversationId],
                metadata: {
                    sessionId: session.id,
                    agentId: agent.id,
                    handoffCause: analysis.cause,
                    avoidable: analysis.avoidable,
                    turnCount: session.turnCount,
                },
                orgId,
            },
        });

        // If avoidable: create flow-refinement suggestion and notify
        if (analysis.avoidable && analysis.suggestion) {
            await prisma.aIInsight.create({
                data: {
                    type: "BEST_APPROACH",
                    title: `Sugestão de melhoria: agente ${agent.name}`,
                    content: analysis.suggestion,
                    confidence: 0.6,
                    sourceConversationIds: [session.conversationId],
                    metadata: {
                        sessionId: session.id,
                        agentId: agent.id,
                        newRuleCandidate: analysis.newRuleCandidate,
                        suggestionType: "FLOW_REFINEMENT",
                    } as never,
                    orgId,
                },
            });

            await this.emitEvent(
                orgId,
                agent.id,
                agent.name,
                "agent:improvement_suggested",
                `O agente "${agent.name}" identificou uma melhoria: ${analysis.suggestion}`,
            );
        }
    }

    private analyzeHandoffCause(session: FullSession): HandoffAnalysis {
        const turns = session.turns;

        // Tool failures
        const toolFailures = turns.filter(
            (t) => t.role === "tool" && (t.toolResult ?? "").toLowerCase().includes("erro"),
        );
        if (toolFailures.length >= 2) {
            const failed = [...new Set(toolFailures.map((t) => t.toolName).filter(Boolean))].join(", ");
            return {
                cause: "TOOL_FAILURE",
                avoidable: true,
                suggestion: `Múltiplos erros de tool (${failed}). Adicionar fallback ou verificar configuração.`,
                newRuleCandidate: { condition: "toolFailureCount >= 2", action: "ESCALATE_WITH_CONTEXT" },
            };
        }

        // Turn count exceeded
        const maxTurns = session.agent.maxTurnsBeforeHuman;
        if (session.turnCount >= maxTurns) {
            const checkpoint = Math.max(1, Math.round(maxTurns * 0.75));
            return {
                cause: "TURN_COUNT_EXCEEDED",
                avoidable: true,
                suggestion: `Atingiu o limite de ${maxTurns} turnos sem concluir. Adicionar checkpoint de resumo antes do limite.`,
                newRuleCandidate: {
                    condition: `turnCount >= ${checkpoint}`,
                    action: "SUMMARIZE_PROGRESS_AND_REDIRECT",
                },
            };
        }

        // Negative sentiment / intent
        const reason = (session.handoffReason ?? "").toLowerCase();
        if (
            reason.includes("negativ") ||
            reason.includes("insatisf") ||
            reason.includes("irritad") ||
            reason.includes("bravo")
        ) {
            return {
                cause: "NEGATIVE_INTENT",
                avoidable: true,
                suggestion:
                    "Acrescentar detecção precoce de sentimento negativo — soft-handoff após 2 turnos negativos consecutivos.",
                newRuleCandidate: {
                    condition: "negativeSentimentTurns >= 2",
                    action: "SOFT_HANDOFF",
                },
            };
        }

        // Explicit risk signal
        if (
            reason.includes("risco") ||
            reason.includes("risk") ||
            reason.includes("ameaça") ||
            reason.includes("urgente")
        ) {
            return { cause: "RISK_SIGNAL", avoidable: false, suggestion: null, newRuleCandidate: null };
        }

        return { cause: "UNKNOWN", avoidable: false, suggestion: null, newRuleCandidate: null };
    }

    private async generateCoachingInsight(
        session: FullSession,
        analysis: HandoffAnalysis,
    ): Promise<string> {
        const agent = session.agent;
        const provider = getAIProvider((agent.provider ?? "OPENAI").toLowerCase());

        const lastTurns = session.turns
            .slice(-8)
            .map((t) => `${t.role}: ${t.content.slice(0, 200)}`)
            .join("\n");

        const prompt =
            `Analise esta sessão de agente IA que terminou em handoff.\n\n` +
            `AGENTE: ${agent.name} (tipo: ${agent.type})\n` +
            `CAUSA DETECTADA: ${analysis.cause}\n` +
            `TURNOS: ${session.turnCount}\n` +
            `RAZÃO DO HANDOFF: ${session.handoffReason ?? "não especificada"}\n\n` +
            `ÚLTIMAS MENSAGENS:\n${lastTurns}\n\n` +
            `Em 3 frases curtas em português:\n` +
            `1. O que o agente poderia ter feito diferente?\n` +
            `2. O handoff era evitável? (sim/não e por quê)\n` +
            `3. Que regra nova poderia prevenir isso?`;

        try {
            const res = await provider.chat(
                [{ role: "user", content: prompt }],
                { temperature: 0.3, maxTokens: 350 },
            );
            return res.content;
        } catch {
            return `Handoff por ${analysis.cause}. ${analysis.suggestion ?? "Revisar configuração do fluxo."}`;
        }
    }

    // =========================================================================
    // weeklyRefinement — aggregate analysis for an agent
    // Enqueued by Cloud Scheduler every Monday via BullMQ job "agent:weekly"
    // =========================================================================

    async weeklyRefinement(agentId: string, orgId: string): Promise<AgentWeeklyReport> {
        const agent = await prisma.aIAgent.findFirst({ where: { id: agentId, orgId } });
        if (!agent) throw new Error("Agente não encontrado");

        const now = new Date();
        const thisMonday = getMostRecentMonday(now);
        const lastMonday = new Date(thisMonday);
        lastMonday.setDate(lastMonday.getDate() - 7);

        // This week sessions with turns
        const thisWeek = await prisma.aIAgentSession.findMany({
            where: { agentId, orgId, startedAt: { gte: thisMonday, lt: now } },
            include: {
                turns: {
                    select: { role: true, content: true, toolName: true, toolResult: true },
                },
            },
        });

        // Previous week (lightweight)
        const lastWeek = await prisma.aIAgentSession.findMany({
            where: { agentId, orgId, startedAt: { gte: lastMonday, lt: thisMonday } },
            select: { goalAchieved: true, status: true },
        });

        // ---------- Core metrics ----------
        const total = thisWeek.length;
        const completed = thisWeek.filter((s) => s.goalAchieved === true).length;
        const handoffs = thisWeek.filter((s) => s.status === "HANDOFF").length;
        const autonomyRate = total > 0 ? completed / total : 0;
        const avgTurns = total > 0 ? thisWeek.reduce((sum, s) => sum + s.turnCount, 0) / total : 0;

        const durations = thisWeek
            .filter((s) => s.endedAt !== null)
            .map((s) => (s.endedAt!.getTime() - s.startedAt.getTime()) / 1000);
        const avgResponseTime =
            durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

        // Previous week autonomy rate
        const prevTotal = lastWeek.length;
        const prevCompleted = lastWeek.filter((s) => s.goalAchieved === true).length;
        const prevAutonomyRate = prevTotal > 0 ? prevCompleted / prevTotal : null;

        // ---------- Pattern extraction ----------
        const handoffTurns = thisWeek
            .filter((s) => s.status === "HANDOFF")
            .map((s) => s.turns);
        const topObjections = extractObjections(handoffTurns);

        const successTurns = thisWeek
            .filter((s) => s.goalAchieved === true)
            .map((s) => s.turns);
        const topSuccessPatterns = extractToolPatterns(successTurns);

        const improvements: string[] = [];

        // ---------- Performance guard: 2 consecutive weeks < 70% ----------
        if (autonomyRate < 0.7 && prevAutonomyRate !== null && prevAutonomyRate < 0.7) {
            const msg =
                `Taxa de autonomia abaixo de 70% por 2 semanas consecutivas ` +
                `(${(autonomyRate * 100).toFixed(0)}% esta, ` +
                `${(prevAutonomyRate * 100).toFixed(0)}% anterior). ` +
                `Relançar aprendizado com conversas mais recentes.`;
            improvements.push(msg);

            await prisma.aIInsight.create({
                data: {
                    type: "COACHING",
                    title: `Agente ${agent.name} com performance abaixo do esperado`,
                    content: msg,
                    confidence: 0.9,
                    sourceConversationIds: [],
                    metadata: { agentId, autonomyRate, prevAutonomyRate, action: "REVIEW_REQUIRED" },
                    orgId,
                },
            });

            // Pause agent if active
            if (agent.status === "ACTIVE") {
                await agentRepo.update(agentId, { status: "PAUSED", isActive: false } as never);
            }
        }

        // ---------- New objections not in playbook ----------
        const playbookPatterns = getPlaybookPatterns(
            agent.flowTemplate as Record<string, unknown> | null,
        );
        const newObjections = topObjections.filter(
            (o) => !playbookPatterns.some((p) => p.toLowerCase().includes(o.toLowerCase())),
        );

        for (const objection of newObjections.slice(0, 3)) {
            const suggestedResponse = await this.findObjectionResponse(objection, orgId);

            await prisma.aIInsight.create({
                data: {
                    type: "OBJECTION",
                    title: `Nova objeção detectada: "${objection.slice(0, 80)}"`,
                    content: suggestedResponse
                        ? `Nova objeção identificada nos handoffs desta semana. ` +
                        `Resposta sugerida (baseada em conversas onde foi superada): ${suggestedResponse}`
                        : `Nova objeção: "${objection}". Sem resposta padrão encontrada — requer validação manual.`,
                    confidence: 0.65,
                    sourceConversationIds: [],
                    metadata: { agentId, objection, suggestedResponse: suggestedResponse ?? null },
                    orgId,
                },
            });

            improvements.push(`Nova objeção frequente: "${objection.slice(0, 60)}"`);
        }

        // ---------- Build and save weekly report ----------
        const report: AgentWeeklyReport = {
            agentId: agent.id,
            agentName: agent.name,
            week: thisMonday.toISOString().slice(0, 10),
            sessionsTotal: total,
            sessionsCompleted: completed,
            sessionsHandoff: handoffs,
            autonomyRate,
            avgTurns,
            avgResponseTime,
            topObjections: topObjections.slice(0, 5),
            topSuccessPatterns: topSuccessPatterns.slice(0, 5),
            suggestedImprovements: improvements,
        };

        await prisma.aIInsight.create({
            data: {
                type: "SUMMARY",
                title: `Relatório semanal: ${agent.name} — ${report.week}`,
                content: buildReportText(report),
                confidence: 1.0,
                sourceConversationIds: [],
                metadata: report as never,
                orgId,
            },
        });

        await this.emitEvent(
            orgId,
            agent.id,
            agent.name,
            "agent:weekly_report",
            `Relatório semanal do agente "${agent.name}" disponível. Autonomia: ${(autonomyRate * 100).toFixed(0)}%.`,
        );

        return report;
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    private async findObjectionResponse(objection: string, orgId: string): Promise<string | null> {
        const row = await prisma.aITrainingData.findFirst({
            where: {
                orgId,
                type: "OBJECTION_RESPONSE",
                isValidated: true,
                input: { contains: objection.slice(0, 40), mode: "insensitive" },
            },
        });
        return row?.output ?? null;
    }

    private async emitEvent(
        orgId: string,
        agentId: string,
        agentName: string,
        event: string,
        message: string,
    ): Promise<void> {
        try {
            const io = getIO();
            io?.to(`org:${orgId}`).emit(event, {
                orgId,
                agentId,
                agentName,
                message,
                timestamp: new Date().toISOString(),
            });
        } catch {
            // Non-fatal
        }
    }
}

// ---------------------------------------------------------------------------
// Module-level utilities
// ---------------------------------------------------------------------------

function getMostRecentMonday(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun … 6=Sat
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
}

const OBJECTION_KEYWORDS = [
    "não quero",
    "não preciso",
    "muito caro",
    "não tenho interesse",
    "já tenho",
    "não me interessa",
    "depois vejo",
    "sem tempo",
    "vou pensar",
    "está caro",
    "não posso agora",
    "deixa pra depois",
];

function extractObjections(turnSets: TurnRow[][]): string[] {
    const freq = new Map<string, number>();
    for (const turns of turnSets) {
        for (const t of turns) {
            if (t.role !== "user") continue;
            const lower = t.content.toLowerCase();
            for (const kw of OBJECTION_KEYWORDS) {
                if (lower.includes(kw)) freq.set(kw, (freq.get(kw) ?? 0) + 1);
            }
        }
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([kw]) => kw);
}

function extractToolPatterns(turnSets: TurnRow[][]): string[] {
    const freq = new Map<string, number>();
    for (const turns of turnSets) {
        for (const t of turns) {
            if (t.role === "tool" && t.toolName) {
                freq.set(t.toolName, (freq.get(t.toolName) ?? 0) + 1);
            }
        }
    }
    return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tool, count]) => `${tool} (${count}x)`);
}

function getPlaybookPatterns(flowTemplate: Record<string, unknown> | null): string[] {
    if (!flowTemplate) return [];
    const playbook = flowTemplate["objectionPlaybook"] as Array<{ pattern: string }> | undefined;
    return (playbook ?? []).map((p) => p.pattern);
}

function buildReportText(r: AgentWeeklyReport): string {
    return [
        `Semana: ${r.week}`,
        `Sessões: ${r.sessionsTotal} total, ${r.sessionsCompleted} concluídas, ${r.sessionsHandoff} handoffs`,
        `Taxa de autonomia: ${(r.autonomyRate * 100).toFixed(1)}%`,
        `Média de turnos: ${r.avgTurns.toFixed(1)}`,
        r.avgResponseTime !== null
            ? `Tempo médio de conversa: ${(r.avgResponseTime / 60).toFixed(1)} min`
            : "",
        r.topObjections.length > 0 ? `Principais objeções: ${r.topObjections.join(", ")}` : "",
        r.topSuccessPatterns.length > 0
            ? `Padrões de sucesso: ${r.topSuccessPatterns.join(", ")}`
            : "",
        r.suggestedImprovements.length > 0
            ? `Melhorias sugeridas:\n${r.suggestedImprovements.map((i) => `• ${i}`).join("\n")}`
            : "",
    ]
        .filter(Boolean)
        .join("\n");
}

// Singleton
export const continuousLearner = new ContinuousLearner();

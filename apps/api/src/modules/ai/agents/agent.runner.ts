/**
 * Super Agent Runner
 *
 * Implements a plan-act-observe loop with:
 * - Goal tracking via `requiredDataPoints`
 * - Confidence thresholding before autonomous action
 * - Turn limits with graceful handoff
 * - Per-turn persistence (`AIAgentTurn`)
 * - Session state machine (ACTIVE → THINKING → WAITING_USER → HANDOFF/ENDED)
 */
import { getAIProvider } from "../ai.factory.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { AgentRepository } from "./agent.repository.js";
import { getAgentTools, getTool, buildToolsPromptSection } from "./tools/index.js";
import { prisma } from "../../../lib/prisma.js";
import { getIO } from "../../../websocket/socket.js";
import type { ChatMessage } from "../providers/ai-provider.interface.js";

const knowledgeService = new KnowledgeService();
const agentRepo = new AgentRepository();

const MAX_TOOL_ITERATIONS = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentRunInput {
    agentId: string;
    conversationId: string;
    message: string;
    contactId: string;
    orgId: string;
}

export interface AgentRunResult {
    sessionId: string;
    response: string;
    reply: string; // legacy compat
    handoff: boolean;
    handoffReason?: string;
    tokensUsed: number;
    goalAchieved: boolean;
    collectedData: Record<string, unknown>;
    missingDataPoints: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOOL_CALL_RE = /```json\s*\n?\s*(\{[^`]+\})\s*\n?```/s;

function extractToolCall(text: string): { tool: string; params: Record<string, unknown> } | null {
    const match = TOOL_CALL_RE.exec(text);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[1]!) as { tool?: string; params?: unknown };
        if (typeof parsed.tool === "string") {
            return { tool: parsed.tool, params: (parsed.params as Record<string, unknown>) ?? {} };
        }
    } catch { /* not valid JSON */ }
    return null;
}

const DEFAULT_HANDOFF_KEYWORDS = [
    "falar com humano", "atendente humano", "falar com pessoa",
    "quero um atendente", "speak to human", "falar com alguem",
    "preciso de ajuda humana",
];

function detectHandoff(
    userMessage: string,
    agentReply: string,
    handoffRules: Record<string, unknown>,
    turnCount: number,
    maxTurns: number,
): { handoff: boolean; reason?: string } {
    const keywords = [...DEFAULT_HANDOFF_KEYWORDS, ...((handoffRules["keywords"] as string[]) ?? [])];
    const haystack = (userMessage + " " + agentReply).toLowerCase();
    for (const kw of keywords) {
        if (haystack.includes(kw.toLowerCase())) {
            return { handoff: true, reason: `Pedido de atendimento humano: "${kw}"` };
        }
    }
    if (turnCount >= maxTurns) {
        return { handoff: true, reason: `Limite de ${maxTurns} turnos atingido` };
    }
    const negativeWords = ["furioso", "absurdo", "pessimo", "horrivel", "inaceitavel"];
    if (negativeWords.some((w) => haystack.includes(w))) {
        return { handoff: true, reason: "Sentimento extremamente negativo detectado" };
    }
    return { handoff: false };
}

/** Determine which required data points are still missing from collected data */
function getMissingDataPoints(
    required: string[],
    collected: Record<string, unknown>,
): string[] {
    return required.filter((k) => {
        const v = collected[k];
        return v === undefined || v === null || v === "";
    });
}

/** Build a goal/state section to inject into the system prompt each turn */
function buildStateSection(
    goal: string,
    requiredDataPoints: string[],
    collectedData: Record<string, unknown>,
    currentStep: string | null | undefined,
    pendingQuestions: unknown[],
    confidenceThreshold: number,
): string {
    const missing = getMissingDataPoints(requiredDataPoints, collectedData);
    const collected = Object.entries(collectedData)
        .map(([k, v]) => `  - ${k}: ${String(v)}`)
        .join("\n");

    return `\n\n### Objetivo do Agente\n${goal}` +
        (currentStep ? `\n\n### Etapa Atual\n${currentStep}` : "") +
        (Object.keys(collectedData).length > 0
            ? `\n\n### Dados Coletados\n${collected}`
            : "") +
        (missing.length > 0
            ? `\n\n### Dados AINDA Necessários\nVocê DEVE coletar as seguintes informações antes de prosseguir:\n${missing.map((d) => `  - ${d}`).join("\n")}`
            : "\n\n### Status dos Dados\nTodos os dados necessários foram coletados. Você pode prosseguir com a ação.") +
        (pendingQuestions.length > 0
            ? `\n\n### Próxima Pergunta Pendente\nFaça esta pergunta ao usuário: ${String(pendingQuestions[0])}`
            : "") +
        `\n\n### Regra de Confiança\nSó execute ações irreversíveis (envio de proposta, criação de deal, etc.) quando sua confiança for >= ${confidenceThreshold}. Se menor, confirme com o usuário antes.`;
}

/** Parse data points extracted by the model from the response */
function parseCollectedDataUpdate(
    responseText: string,
    existing: Record<string, unknown>,
): Record<string, unknown> {
    const match = /```collected_data\s*\n?(\{[^`]+\})\s*\n?```/s.exec(responseText);
    if (!match) return existing;
    try {
        const parsed = JSON.parse(match[1]!) as Record<string, unknown>;
        return { ...existing, ...parsed };
    } catch {
        return existing;
    }
}

/** Detect goal achievement from model response */
function detectGoalAchieved(responseText: string): boolean {
    return /\[GOAL_ACHIEVED\]/.test(responseText);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runSuperAgent(input: AgentRunInput): Promise<AgentRunResult> {
    const { agentId, orgId: oid, conversationId: convId, message: userMessage, contactId } = input;

    const agent = await agentRepo.findById(agentId, oid);
    if (!agent) {
        const err = new Error("Agente não encontrado") as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
    }

    // -----------------------------------------------------------------------
    // Session management
    // -----------------------------------------------------------------------
    let session = await agentRepo.findActiveSession(convId);
    if (!session || session.agentId !== agentId) {
        await agentRepo.createSession({ agentId, conversationId: convId, orgId: oid });
        session = await agentRepo.findActiveSession(convId);
    }
    if (!session) throw new Error("Falha ao criar sessão do agente");

    // Persist user turn
    await agentRepo.createTurn({ sessionId: session.id, role: "user", content: userMessage });

    // -----------------------------------------------------------------------
    // Session state
    // -----------------------------------------------------------------------
    const collectedData = (session.collectedData ?? {}) as Record<string, unknown>;
    const pendingQuestions = (session.pendingQuestions ?? []) as unknown[];
    const currentStep = session.currentStep ?? undefined;
    const requiredDataPoints = (agent.requiredDataPoints as string[] | null) ?? [];
    const maxTurns = agent.maxTurnsBeforeHuman;

    // -----------------------------------------------------------------------
    // Context assembly
    // -----------------------------------------------------------------------

    // Contact context
    let contactContext = "";
    if (contactId) {
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, orgId: oid },
            select: { name: true, email: true, phone: true, tags: true, type: true, customFields: true },
        });
        if (contact) {
            contactContext = "\n\n### Informações do Contato\n" +
                `Nome: ${contact.name}\nEmail: ${contact.email ?? "—"}\n` +
                `Telefone: ${contact.phone ?? "—"}\nTipo: ${contact.type}\n` +
                `Tags: ${contact.tags.join(", ") || "nenhuma"}`;
        }
    }

    // RAG
    let kbContext = "";
    if (agent.knowledgeBaseIds.length > 0) {
        const results = await knowledgeService.search(
            { query: userMessage, knowledgeBaseIds: agent.knowledgeBaseIds, limit: 4 },
            oid,
        );
        if (results.length > 0) {
            kbContext = "\n\n### Base de Conhecimento:\n" +
                results.map((r, i) => `[${i + 1}] ${r.content}`).join("\n---\n");
        }
    }

    // Training data
    const trainingData = await prisma.aITrainingData.findMany({
        where: { orgId: oid, isValidated: true },
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { type: true, input: true, output: true },
    });
    let trainingContext = "";
    if (trainingData.length > 0) {
        trainingContext = "\n\n### Exemplos Validados:\n" +
            trainingData.map((t) => `[${t.type}]\nCliente: ${t.input}\nResposta: ${t.output}`).join("\n---\n");
    }

    // Flow template context (if available)
    let flowContext = "";
    if (agent.flowTemplate) {
        flowContext = "\n\n### Fluxo de Atendimento Validado:\n" +
            JSON.stringify(agent.flowTemplate, null, 2);
    }
    if (agent.decisionRules) {
        flowContext += "\n\n### Regras de Decisão:\n" + JSON.stringify(agent.decisionRules, null, 2);
    }

    // Tools
    const enabledToolConfig = agent.enabledTools as Record<string, unknown>;
    const enabledToolNames = (enabledToolConfig["enabled"] as string[] | undefined) ?? [];
    const tools = getAgentTools(enabledToolNames);
    const toolsSection = buildToolsPromptSection(tools);
    const toolContext = {
        orgId: oid, contactId, conversationId: convId, agentId,
        knowledgeBaseIds: agent.knowledgeBaseIds,
    };

    // Goal / state section
    const stateSection = buildStateSection(
        agent.goal,
        requiredDataPoints,
        collectedData,
        currentStep,
        pendingQuestions,
        agent.confidenceThreshold,
    );

    // Personality injection
    const personality = agent.personality as Record<string, unknown>;
    const personalitySection = Object.keys(personality).length > 0
        ? "\n\n### Personalidade\n" + JSON.stringify(personality, null, 2)
        : "";

    // History from AIAgentTurns (more accurate than raw messages)
    const prevTurns = await agentRepo.listTurns(session.id);
    const chatHistory: ChatMessage[] = prevTurns
        .filter((t) => t.role !== "tool")
        .map((t) => ({
            role: t.role as "user" | "assistant",
            content: t.content,
        }));

    const systemPrompt =
        agent.systemPrompt +
        personalitySection +
        contactContext +
        kbContext +
        trainingContext +
        flowContext +
        stateSection +
        toolsSection +
        "\n\nSe você identificar dados coletados durante a conversa, extraia-os num bloco ```collected_data {...}```." +
        "\nSe o objetivo foi totalmente alcançado, inclua [GOAL_ACHIEVED] na resposta.";

    const providerName = (agent.provider ?? "OPENAI").toLowerCase();
    const provider = getAIProvider(providerName);

    // -----------------------------------------------------------------------
    // Agentic loop
    // -----------------------------------------------------------------------
    let messages: ChatMessage[] = [...chatHistory, { role: "user", content: userMessage }];
    let finalResponse = "";
    let totalTokens = 0;
    let updatedCollectedData = { ...collectedData };

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const aiResponse = await provider.chat(messages, {
            temperature: agent.temperature,
            maxTokens: agent.maxTokens,
            systemPrompt,
        });
        totalTokens += aiResponse.tokensUsed;
        const responseText = aiResponse.content;

        // Extract any data points the model identified
        updatedCollectedData = parseCollectedDataUpdate(responseText, updatedCollectedData);

        const toolCall = extractToolCall(responseText);
        if (!toolCall) {
            finalResponse = responseText
                .replace(TOOL_CALL_RE, "")
                .replace(/```collected_data[^`]*```/s, "")
                .replace(/\[GOAL_ACHIEVED\]/g, "")
                .trim();
            break;
        }

        const tool = getTool(toolCall.tool);
        let toolResult: string;
        if (!tool) {
            toolResult = `Ferramenta "${toolCall.tool}" não encontrada.`;
        } else {
            try {
                const parsedParams = tool.parametersSchema.safeParse(toolCall.params);
                if (!parsedParams.success) {
                    toolResult = `Parâmetros inválidos para ${toolCall.tool}: ${parsedParams.error.message}`;
                } else {
                    const tr = await tool.execute(parsedParams.data, toolContext);
                    toolResult = typeof tr === "string" ? tr : tr.humanReadable;
                }
            } catch (err) {
                toolResult = `Erro ao executar ${toolCall.tool}: ${err instanceof Error ? err.message : String(err)}`;
            }
        }

        // Persist tool turn
        await agentRepo.createTurn({
            sessionId: session.id,
            role: "tool",
            content: toolResult,
            toolName: toolCall.tool,
            toolParams: toolCall.params,
            toolResult,
            tokensUsed: aiResponse.tokensUsed,
        });

        messages = [
            ...messages,
            { role: "assistant", content: responseText },
            { role: "user", content: `[Resultado da ferramenta ${toolCall.tool}]\n${toolResult}` },
        ];

        if (iteration === MAX_TOOL_ITERATIONS - 1) {
            finalResponse = responseText.replace(TOOL_CALL_RE, "").trim();
        }
    }

    if (!finalResponse) finalResponse = "Desculpe, não consegui processar sua solicitação.";

    const goalAchieved = detectGoalAchieved(finalResponse);
    const missingDataPoints = getMissingDataPoints(requiredDataPoints, updatedCollectedData);

    // -----------------------------------------------------------------------
    // Handoff detection
    // -----------------------------------------------------------------------
    const handoffRules = agent.handoffRules as Record<string, unknown>;
    const { handoff, reason: handoffReason } = detectHandoff(
        userMessage, finalResponse, handoffRules, session.turnCount + 1, maxTurns,
    );

    // -----------------------------------------------------------------------
    // Persist bot message
    // -----------------------------------------------------------------------
    await prisma.message.create({
        data: {
            content: finalResponse,
            type: "TEXT",
            direction: "OUTBOUND",
            status: "SENT",
            conversationId: convId,
            senderId: null,
            metadata: {
                generatedBy: "super_agent",
                agentId,
                tokensUsed: totalTokens,
                goalAchieved,
                missingDataPoints,
            },
        },
    });
    await prisma.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });

    // Persist assistant turn
    await agentRepo.createTurn({
        sessionId: session.id,
        role: "assistant",
        content: finalResponse,
        tokensUsed: totalTokens,
    });

    // -----------------------------------------------------------------------
    // Update session state
    // -----------------------------------------------------------------------
    const nextStatus = handoff ? "HANDOFF" : goalAchieved ? "ENDED" : "WAITING_USER";

    await agentRepo.updateSessionState(session.id, {
        status: nextStatus,
        collectedData: updatedCollectedData,
        handoffReason: handoffReason,
        handoffData: handoff ? { missingDataPoints, collectedData: updatedCollectedData } : undefined,
        goalAchieved: goalAchieved || undefined,
        outcome: goalAchieved ? "goal_achieved" : undefined,
        endedAt: nextStatus === "ENDED" ? new Date() : undefined,
    });

    // Update agent's learnedFromCount
    if (goalAchieved) {
        await agentRepo.update(agentId, {
            learnedFromCount: { increment: 1 },
        } as never);
    }

    // -----------------------------------------------------------------------
    // Socket.io events
    // -----------------------------------------------------------------------
    const io = getIO();
    if (io) {
        io.to(`conversation:${convId}`).emit("message:new", {
            conversationId: convId,
            content: finalResponse,
            direction: "OUTBOUND",
            sender: "bot",
        });
        if (handoff) {
            io.to(`conversation:${convId}`).emit("agent:handoff", {
                conversationId: convId, agentId, reason: handoffReason,
            });
            io.to(`org:${oid}`).emit("agent:handoff", {
                conversationId: convId, agentId, reason: handoffReason,
            });
        }
        if (goalAchieved) {
            io.to(`org:${oid}`).emit("agent:goal_achieved", {
                conversationId: convId, agentId,
            });
        }
    }

    return {
        sessionId: session.id,
        response: finalResponse,
        reply: finalResponse,
        handoff,
        handoffReason,
        tokensUsed: totalTokens,
        goalAchieved,
        collectedData: updatedCollectedData,
        missingDataPoints,
    };
}

// ---------------------------------------------------------------------------
// Legacy export (kept for backwards compatibility)
// ---------------------------------------------------------------------------
export type LegacyAgentRunResult = AgentRunResult;

export async function runAgent(
    agentIdOrInput: string | AgentRunInput,
    conversationId?: string,
    message?: string,
    orgId?: string,
): Promise<LegacyAgentRunResult> {
    let inp: AgentRunInput;
    if (typeof agentIdOrInput === "object") {
        inp = agentIdOrInput;
    } else {
        const conv = await prisma.conversation.findFirst({
            where: { id: conversationId! },
            select: { contactId: true },
        });
        inp = {
            agentId: agentIdOrInput,
            conversationId: conversationId!,
            message: message!,
            contactId: conv?.contactId ?? "",
            orgId: orgId!,
        };
    }
    return runSuperAgent(inp);
}

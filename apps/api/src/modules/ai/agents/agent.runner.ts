import { getAIProvider } from "../ai.factory.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { AgentRepository } from "./agent.repository.js";
import { getAgentTools, getTool, buildToolsPromptSection } from "./tools/index.js";
import { prisma } from "../../../lib/prisma.js";
import { getIO } from "../../../websocket/socket.js";
import type { ChatMessage } from "../providers/ai-provider.interface.js";

const knowledgeService = new KnowledgeService();
const agentRepo = new AgentRepository();

const MAX_TOOL_ITERATIONS = 5;

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
    handoff: boolean;
    handoffReason?: string;
    tokensUsed: number;
}

// Legacy result shape (old callers used "reply" instead of "response")
export type LegacyAgentRunResult = AgentRunResult & { reply: string };

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
    "quero um atendente", "speak to human", "quero falar com alguem",
    "preciso de ajuda humana",
];

function detectHandoff(
    userMessage: string,
    agentReply: string,
    handoffRules: Record<string, unknown>,
    sessionMessagesHandled: number,
): { handoff: boolean; reason?: string } {
    const keywords = [...DEFAULT_HANDOFF_KEYWORDS, ...((handoffRules.keywords as string[]) ?? [])];
    const haystack = (userMessage + " " + agentReply).toLowerCase();
    for (const kw of keywords) {
        if (haystack.includes(kw.toLowerCase())) {
            return { handoff: true, reason: `Pedido de atendimento humano: "${kw}"` };
        }
    }
    const maxMessages = handoffRules.maxMessages as number | undefined;
    if (maxMessages && sessionMessagesHandled >= maxMessages) {
        return { handoff: true, reason: "Limite de mensagens do agente atingido" };
    }
    const negativeWords = ["furioso", "absurdo", "pessimo", "horrivel", "inaceitavel"];
    if (negativeWords.some((w) => haystack.includes(w))) {
        return { handoff: true, reason: "Sentimento negativo detectado" };
    }
    return { handoff: false };
}

export async function runAgent(input: AgentRunInput): Promise<LegacyAgentRunResult>;
export async function runAgent(agentId: string, conversationId: string, message: string, orgId: string): Promise<LegacyAgentRunResult>;
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

    const { agentId, orgId: oid, conversationId: convId, message: userMessage, contactId } = inp;

    const agent = await agentRepo.findById(agentId, oid);
    if (!agent) {
        const err = new Error("Agente nao encontrado") as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
    }

    type ActiveSession = Awaited<ReturnType<typeof agentRepo.findActiveSession>>;
    let session: ActiveSession = await agentRepo.findActiveSession(convId);
    if (!session || session.agentId !== agentId) {
        await agentRepo.createSession({ agentId, conversationId: convId, orgId: oid });
        session = await agentRepo.findActiveSession(convId);
    }

    // Contact context
    let contactContext = "";
    if (contactId) {
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, orgId: oid },
            select: { name: true, email: true, phone: true, tags: true, type: true },
        });
        if (contact) {
            contactContext = "\n\n### Informacoes do Contato Atual\n" +
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
            kbContext = "\n\n### Contexto da Base de Conhecimento:\n" +
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
        trainingContext = "\n\n### Exemplos Validados pela Equipe:\n" +
            trainingData.map((t) => `[${t.type}]\nCliente: ${t.input}\nResposta: ${t.output}`).join("\n---\n");
    }

    // Tools
    const agentToolConfig = agent.tools as Record<string, unknown>;
    const enabledToolNames = (agentToolConfig.enabled as string[] | undefined) ?? [];
    const tools = getAgentTools(enabledToolNames);
    const toolsSection = buildToolsPromptSection(tools);
    const toolContext = { orgId: oid, contactId, conversationId: convId, agentId, knowledgeBaseIds: agent.knowledgeBaseIds };

    // History
    const history = await prisma.message.findMany({
        where: { conversationId: convId },
        orderBy: { sentAt: "desc" },
        take: 20,
        select: { content: true, direction: true },
    });
    const chatHistory: ChatMessage[] = history.reverse().map((m) => ({
        role: m.direction === "INBOUND" ? "user" : "assistant",
        content: m.content,
    }));

    const systemPrompt = agent.systemPrompt + contactContext + kbContext + trainingContext + toolsSection;
    const provider = getAIProvider(agent.provider.toLowerCase());

    // Agentic loop
    let messages: ChatMessage[] = [...chatHistory, { role: "user", content: userMessage }];
    let finalResponse = "";
    let totalTokens = 0;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const aiResponse = await provider.chat(messages, {
            temperature: agent.temperature,
            maxTokens: agent.maxTokens,
            systemPrompt,
        });
        totalTokens += aiResponse.tokensUsed;
        const responseText = aiResponse.content;
        const toolCall = extractToolCall(responseText);

        if (!toolCall) {
            finalResponse = responseText;
            break;
        }

        const tool = getTool(toolCall.tool);
        let toolResult: string;
        if (!tool) {
            toolResult = `Ferramenta "${toolCall.tool}" nao encontrada.`;
        } else {
            try {
                const parsedParams = tool.parametersSchema.safeParse(toolCall.params);
                if (!parsedParams.success) {
                    toolResult = `Parametros invalidos para ${toolCall.tool}: ${parsedParams.error.message}`;
                } else {
                    toolResult = await tool.execute(parsedParams.data, toolContext);
                }
            } catch (err) {
                toolResult = `Erro ao executar ${toolCall.tool}: ${err instanceof Error ? err.message : String(err)}`;
            }
        }

        messages = [
            ...messages,
            { role: "assistant", content: responseText },
            { role: "user", content: `[Resultado da ferramenta ${toolCall.tool}]\n${toolResult}` },
        ];

        if (iteration === MAX_TOOL_ITERATIONS - 1) {
            finalResponse = responseText.replace(TOOL_CALL_RE, "").trim();
        }
    }

    if (!finalResponse) finalResponse = "Desculpe, nao consegui processar sua solicitacao.";

    // Handoff detection
    const handoffRules = agent.handoffRules as Record<string, unknown>;
    const { handoff, reason: handoffReason } = detectHandoff(
        userMessage, finalResponse, handoffRules, session!.messagesHandled,
    );

    // Save bot message
    await prisma.message.create({
        data: {
            content: finalResponse,
            type: "TEXT",
            direction: "OUTBOUND",
            status: "SENT",
            conversationId: convId,
            senderId: null,
            metadata: { generatedBy: "ai_agent", agentId, tokensUsed: totalTokens },
        },
    });
    await prisma.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });

    // Update session
    await agentRepo.incrementSessionMessages(session!.id);
    if (handoff) {
        await agentRepo.endSession(session!.id, handoffReason);
        const io = getIO();
        if (io) {
            io.to(`conversation:${convId}`).emit("agent:handoff", { conversationId: convId, agentId, reason: handoffReason });
            io.to(`org:${oid}`).emit("agent:handoff", { conversationId: convId, agentId, reason: handoffReason });
        }
    }

    const io = getIO();
    if (io) {
        io.to(`conversation:${convId}`).emit("message:new", {
            conversationId: convId, content: finalResponse, direction: "OUTBOUND", sender: "bot",
        });
    }

    return {
        sessionId: session!.id,
        response: finalResponse,
        reply: finalResponse, // legacy compat
        handoff,
        handoffReason,
        tokensUsed: totalTokens,
    };
}

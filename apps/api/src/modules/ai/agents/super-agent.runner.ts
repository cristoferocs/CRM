/**
 * super-agent.runner.ts
 *
 * Full ReAct (Reason + Act) engine for autonomous super agents.
 *
 * Loop:
 *  1. Load context  — agent config, session state, conversation history,
 *                     contact data, KB RAG, training data
 *  2. Observe       — build rich observation object
 *  3. Reason+Plan   — call LLM, get structured JSON reasoning response
 *  4. Execute Tools — run up to MAX_TOOL_CALLS tools from toolsToCall list
 *  5. Re-reason     — if tools were called, feed results back into model
 *  6. Update State  — merge collectedData, update session, increment turns
 *  7. Save Turn     — persist AIAgentTurn with full diagnostics
 *  8. Handoff       — emit socket events for human handoff or goal achieved
 */
import { prisma } from "../../../lib/prisma.js";
import { getAIProvider } from "../ai.factory.js";
import { KnowledgeService } from "../knowledge/knowledge.service.js";
import { AgentRepository } from "./agent.repository.js";
import { toolRegistry } from "./tool-registry.js";
import { getIO } from "../../../websocket/socket.js";
import { fireAutomation } from "../../automations/automation-dispatcher.js";

// side-effect import: registers all tools in toolRegistry
import "./tools/index.js";

import { applySpecializedDefaults } from "./specialized/index.js";
import type { ChatMessage } from "../providers/ai-provider.interface.js";
import type { ToolContext } from "./tool-registry.js";

const knowledgeService = new KnowledgeService();
const agentRepo = new AgentRepository();

const MAX_TOOL_CALLS = 5;
const MAX_REACT_ITERATIONS = 3; // reason → tools → re-reason cycles

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SuperAgentInput {
    agentId: string;
    sessionId?: string;
    conversationId: string;
    message: string;
    contactId: string;
    orgId: string;
}

export interface SuperAgentResult {
    sessionId: string;
    response: string;
    handoff: boolean;
    handoffReason?: string;
    goalAchieved: boolean;
    tokensUsed: number;
    collectedData: Record<string, unknown>;
    missingDataPoints: string[];
    confidence: number;
    reasoning?: string;
    planSteps?: string[];
}

// ---------------------------------------------------------------------------
// Internal types for the structured JSON the model must return
// ---------------------------------------------------------------------------

interface ReActResponse {
    observation: string;
    reasoning: string;
    intent: string;
    intentConfidence: number; // 0–1
    currentStep: string;
    dataCollected: Record<string, unknown>;
    pendingQuestions: string[];
    planSteps: string[];
    toolsToCall: Array<{
        name: string;
        params: Record<string, unknown>;
        reason: string;
    }>;
    response: string;
    shouldHandoff: boolean;
    handoffReason?: string;
    goalAchieved: boolean;
    goalAchievedReason?: string;
    confidence: number; // 0–1
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJsonParse(text: string): ReActResponse | null {
    // Try to extract first JSON object or array from the response
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(text.slice(start, end + 1)) as ReActResponse;
    } catch {
        return null;
    }
}

function buildFallbackResponse(
    sessionState: { pendingQuestions?: unknown[]; currentStep?: string | null },
    agentPersonality: Record<string, unknown>,
): ReActResponse {
    const tone = (agentPersonality["tone"] as string) ?? "amigável";
    return {
        observation: "Não foi possível processar a resposta do modelo.",
        reasoning: "Fallback devido a resposta inválida do modelo.",
        intent: "unknown",
        intentConfidence: 0,
        currentStep: sessionState.currentStep ?? "inicio",
        dataCollected: {},
        pendingQuestions: [],
        planSteps: [],
        toolsToCall: [],
        response:
            `Desculpe, tive um problema técnico. Pode repetir sua mensagem? ` +
            `Estou aqui para ajudar com muito ${tone}.`,
        shouldHandoff: false,
        goalAchieved: false,
        confidence: 0,
    };
}

/** Merge new collected data on top of existing — never overwrite with null */
function mergeCollectedData(
    existing: Record<string, unknown>,
    incoming: Record<string, unknown>,
): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
        if (value !== null && value !== undefined && value !== "") {
            merged[key] = value;
        }
    }
    return merged;
}

/** Return required data-point keys still missing */
function getMissingDataPoints(
    required: string[],
    collected: Record<string, unknown>,
): string[] {
    return required.filter(
        (key) => collected[key] === undefined || collected[key] === null || collected[key] === "",
    );
}

// ---------------------------------------------------------------------------
// SuperAgentRunner
// ---------------------------------------------------------------------------

export class SuperAgentRunner {
    // -------------------------------------------------------------------------
    // Public entry point
    // -------------------------------------------------------------------------

    async run(input: SuperAgentInput): Promise<SuperAgentResult> {
        const t0 = Date.now();

        // Step 1: Load context
        const ctx = await this.loadContext(input);
        if ("error" in ctx) {
            return this.errorResult(ctx.error ?? "Unknown error", input);
        }

        const { agent, session, history: rawHistory, contact, contactDeals, contactPayments, kbResults, trainingData } = ctx;
        const history = rawHistory.map((m) => ({ content: m.content, direction: m.direction as string, sentAt: m.sentAt }));

        // Apply specialized defaults for CUSTOMER_SUCCESS, RETENTION, UPSELL etc.
        const specializedAgent = applySpecializedDefaults(agent.type ?? "", {
            systemPrompt: agent.systemPrompt,
            enabledTools: agent.enabledTools as string[] | undefined,
            requiredDataPoints: agent.requiredDataPoints as string[] | undefined,
            handoffRules: agent.handoffRules as Record<string, unknown> | null | undefined,
            personality: (agent.personality as Record<string, unknown>) ?? {},
        });

        const personality = (specializedAgent.personality as Record<string, unknown>) ?? {};
        const requiredDataPoints = (specializedAgent.requiredDataPoints as string[]) ?? [];
        const maxTurns = agent.maxTurnsBeforeHuman ?? 20;
        const confidenceThreshold = agent.confidenceThreshold ?? 0.75;
        const handoffRules = (specializedAgent.handoffRules as Record<string, unknown>) ?? {};
        const existingCollected = (session.collectedData as Record<string, unknown>) ?? {};
        const enabledTools = toolRegistry.getEnabled(specializedAgent.enabledTools ?? agent.enabledTools);
        const flowTemplate = agent.flowTemplate ?? (agent as Record<string, unknown>)["flowTemplate"] ?? null;
        const decisionRules = (agent as Record<string, unknown>)["decisionRules"] ?? null;

        const toolCtx: ToolContext = {
            orgId: input.orgId,
            contactId: input.contactId,
            conversationId: input.conversationId,
            agentId: input.agentId,
            sessionId: session.id,
            knowledgeBaseIds: (agent as Record<string, unknown>)["knowledgeBaseIds"] as string[] | undefined,
        };

        let totalTokens = 0;

        // Step 2: Build observation
        const observation = this.buildObservation({
            contact,
            history,
            session,
            existingCollected,
            requiredDataPoints,
            kbResults,
            trainingData,
        });

        // Step 3: Reason + Plan (first pass)
        const systemPrompt = this.buildSystemPrompt({
            agent: { ...agent, systemPrompt: specializedAgent.systemPrompt ?? agent.systemPrompt },
            personality,
            enabledTools,
            flowTemplate,
            decisionRules,
            requiredDataPoints,
            handoffRules,
            session,
        });

        const messages: ChatMessage[] = [
            ...history.slice(-20).map((m) => ({
                role: (m.direction === "OUTBOUND" ? "assistant" : "user") as "user" | "assistant",
                content: m.content,
            })),
            {
                role: "user",
                content:
                    `## Observação Atual\n${JSON.stringify(observation, null, 2)}\n\n` +
                    `## Mensagem do Usuário\n${input.message}`,
            },
        ];

        const provider = getAIProvider(
            (agent.provider as string | undefined) ?? "google",
        );

        let reactResult = await this.reasonAndPlan(provider, systemPrompt, messages);
        totalTokens += reactResult.tokensUsed;

        let parsed = reactResult.parsed ?? buildFallbackResponse(
            {
                pendingQuestions: Array.isArray(session.pendingQuestions) ? session.pendingQuestions as unknown[] : undefined,
                currentStep: session.currentStep,
            },
            personality,
        );

        // Step 4: Execute tools (up to MAX_REACT_ITERATIONS cycles)
        let toolResults: Array<{ name: string; result: string; success: boolean }> = [];

        for (let iter = 0; iter < MAX_REACT_ITERATIONS && parsed.toolsToCall?.length > 0; iter++) {
            const newToolResults = await this.executeTools(
                parsed.toolsToCall,
                toolCtx,
                enabledTools.map((t) => t.name),
            );
            toolResults = toolResults.concat(newToolResults);
            totalTokens += 0; // tool calls don't use LLM tokens directly

            // Re-reason with tool results injected
            const toolResultsBlock =
                "\n\n## Resultados das Ferramentas\n" +
                newToolResults
                    .map((tr) => `### ${tr.name}\n${tr.result}`)
                    .join("\n\n");

            const reReasonMessages: ChatMessage[] = [
                ...messages,
                { role: "assistant", content: JSON.stringify(parsed) },
                { role: "user", content: toolResultsBlock },
            ];

            const reReasonResult = await this.reasonAndPlan(provider, systemPrompt, reReasonMessages);
            totalTokens += reReasonResult.tokensUsed;

            if (reReasonResult.parsed) {
                parsed = reReasonResult.parsed;
            }

            // If the model no longer wants to call tools, break
            if (!parsed.toolsToCall || parsed.toolsToCall.length === 0) break;
        }

        // Step 5: Update state
        const newCollected = mergeCollectedData(existingCollected, parsed.dataCollected ?? {});
        const missingDataPoints = getMissingDataPoints(requiredDataPoints, newCollected);
        const turnCount = (session.turnCount ?? 0) + 1;

        // Determine final status
        let finalStatus: "ACTIVE" | "THINKING" | "WAITING_USER" | "HANDOFF" | "ENDED" = "ACTIVE";
        let handoffReason: string | undefined;
        let handoffData: Record<string, unknown> | undefined;

        const shouldHandoffByTurns = turnCount >= maxTurns;
        const shouldHandoffByConfidence =
            parsed.confidence < confidenceThreshold && missingDataPoints.length === 0;
        const shouldHandoffByModel = parsed.shouldHandoff;

        if (parsed.goalAchieved) {
            finalStatus = "ENDED";
        } else if (shouldHandoffByModel || shouldHandoffByTurns || shouldHandoffByConfidence) {
            finalStatus = "HANDOFF";
            handoffReason =
                parsed.handoffReason ??
                (shouldHandoffByTurns
                    ? `Limite de ${maxTurns} turnos atingido`
                    : `Confiança baixa (${(parsed.confidence * 100).toFixed(0)}%) após coleta completa`);

            handoffData = this.buildHandoffData({
                session,
                agent,
                contact,
                contactDeals,
                parsed,
                newCollected,
                handoffReason,
                toolResults,
            });
        } else if (parsed.pendingQuestions?.length > 0) {
            finalStatus = "WAITING_USER";
        }

        await agentRepo.updateSessionState(session.id, {
            status: finalStatus,
            intent: parsed.intent,
            intentConfidence: parsed.intentConfidence,
            currentStep: parsed.currentStep,
            collectedData: newCollected,
            pendingQuestions: parsed.pendingQuestions,
            planSteps: parsed.planSteps,
            handoffReason,
            handoffData,
            goalAchieved: parsed.goalAchieved || undefined,
            outcome: parsed.goalAchievedReason,
        });

        // Step 6: Save turn
        await agentRepo.createTurn({
            sessionId: session.id,
            role: "assistant",
            content: JSON.stringify({
                observation,
                reasoning: parsed.reasoning,
                plan: parsed.planSteps,
                toolsCalled: toolResults.map((tr) => tr.name),
                response: parsed.response,
                stateAfter: finalStatus,
                confidence: parsed.confidence,
                latencyMs: Date.now() - t0,
            }),
            tokensUsed: totalTokens,
        });

        // Also save the user's message as a turn
        await agentRepo.createTurn({
            sessionId: session.id,
            role: "user",
            content: input.message,
        });

        // Step 7: Emit socket events
        await this.emitEvents({
            finalStatus,
            orgId: input.orgId,
            conversationId: input.conversationId,
            sessionId: session.id,
            agentId: input.agentId,
            contactId: input.contactId,
            response: parsed.response,
            handoffData,
            goalAchievedReason: parsed.goalAchievedReason,
        });

        return {
            sessionId: session.id,
            response: parsed.response,
            handoff: finalStatus === "HANDOFF",
            handoffReason,
            goalAchieved: parsed.goalAchieved,
            tokensUsed: totalTokens,
            collectedData: newCollected,
            missingDataPoints,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning,
            planSteps: parsed.planSteps,
        };
    }

    // -------------------------------------------------------------------------
    // Step 1: Load Context
    // -------------------------------------------------------------------------

    private async loadContext(input: SuperAgentInput) {
        const agent = await agentRepo.findById(input.agentId, input.orgId);
        if (!agent) return { error: `Agent ${input.agentId} not found` };

        // Resolve or create session
        let session = input.sessionId
            ? await agentRepo.findSession(input.sessionId)
            : await agentRepo.findActiveSession(input.conversationId);

        if (!session) {
            session = await agentRepo.createSession({
                agentId: input.agentId,
                conversationId: input.conversationId,
                orgId: input.orgId,
            });
        }

        // Parallel data loads
        const [history, contact, contactDeals, contactPayments, kbResults, trainingData] =
            await Promise.all([
                prisma.message.findMany({
                    where: { conversationId: input.conversationId },
                    orderBy: { sentAt: "desc" },
                    take: 30,
                    select: { content: true, direction: true, sentAt: true },
                }).then((msgs) => msgs.reverse()),

                prisma.contact.findFirst({
                    where: { id: input.contactId, orgId: input.orgId },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        type: true,
                        source: true,
                        tags: true,
                        customFields: true,
                        company: { select: { name: true, segment: true } },
                    },
                }),

                prisma.deal.findMany({
                    where: { contactId: input.contactId, orgId: input.orgId, isActive: true },
                    orderBy: { updatedAt: "desc" },
                    take: 5,
                    include: {
                        stage: { select: { name: true, isWon: true, isLost: true } },
                        pipeline: { select: { name: true } },
                    },
                }),

                prisma.payment.findMany({
                    where: { contactId: input.contactId, orgId: input.orgId },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: { status: true, amount: true, description: true, createdAt: true },
                }),

                knowledgeService.search(
                    {
                        query: input.message,
                        knowledgeBaseIds:
                            ((agent as Record<string, unknown>)["knowledgeBaseIds"] as string[] | undefined) ?? [],
                        limit: 5,
                    },
                    input.orgId,
                ).catch(() => []),

                prisma.aITrainingData.findMany({
                    where: { orgId: input.orgId, isValidated: true },
                    orderBy: { createdAt: "desc" },
                    take: 10,
                    select: { type: true, input: true, output: true },
                }),
            ]);

        return {
            agent,
            session,
            history,
            contact,
            contactDeals,
            contactPayments,
            kbResults,
            trainingData,
        };
    }

    // -------------------------------------------------------------------------
    // Step 2: Build Observation
    // -------------------------------------------------------------------------

    private buildObservation(opts: {
        contact: {
            id: string;
            name: string | null;
            email: string | null;
            phone: string | null;
            type: string;
            source: string;
            tags: string[];
            customFields: unknown;
            company: { name: string; segment: string | null } | null;
        } | null;
        history: Array<{ content: string; direction: string; sentAt: Date }>;
        session: {
            intent?: string | null;
            currentStep?: string | null;
            collectedData?: unknown;
            pendingQuestions?: unknown;
            planSteps?: unknown;
            turnCount?: number;
        };
        existingCollected: Record<string, unknown>;
        requiredDataPoints: string[];
        kbResults: Array<{ content: string }>;
        trainingData: Array<{ type: string; input: string; output: string }>;
    }) {
        const { contact, history, session, existingCollected, requiredDataPoints, kbResults, trainingData } = opts;
        const missingKeys = getMissingDataPoints(requiredDataPoints, existingCollected);
        const lastMessages = history.slice(-5);
        const lastAgentMessage = [...history].reverse().find((m) => m.direction === "OUTBOUND" || m.direction === "outbound");

        // Simple tone detection from last 3 user messages
        const recentUserText = history
            .filter((m) => m.direction === "INBOUND")
            .slice(-3)
            .map((m) => m.content)
            .join(" ")
            .toLowerCase();
        const negativeWords = ["chateado", "bravo", "irritado", "absurdo", "pessimo", "horrivel"];
        const tone = negativeWords.some((w) => recentUserText.includes(w)) ? "negativo" : "neutro/positivo";

        return {
            contactName: contact?.name ?? "Desconhecido",
            contactType: contact?.type ?? "LEAD",
            contactTags: contact?.tags ?? [],
            contactCustomFields: contact?.customFields ?? {},
            contactCompany: contact?.company?.name,
            recentHistory: lastMessages.map((m) => ({
                direction: m.direction,
                content: m.content.slice(0, 300),
            })),
            currentIntent: session.intent ?? "unknown",
            collectedSoFar: existingCollected,
            missingRequiredData: missingKeys,
            currentFlowStep: session.currentStep ?? "inicio",
            pendingQuestions: session.pendingQuestions ?? [],
            currentPlanSteps: session.planSteps ?? [],
            conversationTone: tone,
            lastAgentAction: lastAgentMessage?.content?.slice(0, 200) ?? null,
            turnCount: session.turnCount ?? 0,
            relevantKnowledge: kbResults.map((r) => r.content.slice(0, 400)),
            validatedResponses: trainingData.slice(0, 5).map((t) => ({
                type: t.type,
                example: `Q: ${t.input}\nA: ${t.output}`,
            })),
        };
    }

    // -------------------------------------------------------------------------
    // Step 3: Build System Prompt
    // -------------------------------------------------------------------------

    private buildSystemPrompt(opts: {
        agent: {
            name: string;
            systemPrompt?: string | null;
            goal?: string | null;
            successCriteria?: unknown;
        };
        personality: Record<string, unknown>;
        enabledTools: import("./tool-registry.js").AgentTool[];
        flowTemplate: unknown;
        decisionRules: unknown;
        requiredDataPoints: string[];
        handoffRules: Record<string, unknown>;
        session: { turnCount?: number };
    }): string {
        const { agent, personality, enabledTools, flowTemplate, decisionRules, requiredDataPoints, handoffRules, session } = opts;

        const toolsSection = toolRegistry.buildPromptSection(enabledTools);
        const flowSection = flowTemplate
            ? `\n\n### Fluxo de Atendimento\n\`\`\`json\n${JSON.stringify(flowTemplate, null, 2)}\n\`\`\``
            : "";
        const rulesSection = decisionRules
            ? `\n\n### Regras de Decisão\n\`\`\`json\n${JSON.stringify(decisionRules, null, 2)}\n\`\`\``
            : "";
        const requiredSection = requiredDataPoints.length > 0
            ? `\n\n### Dados Obrigatórios a Coletar\n${requiredDataPoints.map((d) => `- ${d}`).join("\n")}`
            : "";
        const handoffSection = Object.keys(handoffRules).length > 0
            ? `\n\n### Regras de Transferência\n\`\`\`json\n${JSON.stringify(handoffRules, null, 2)}\n\`\`\``
            : "";
        const criteriaSection = agent.successCriteria
            ? `\n\n### Critérios de Sucesso\n\`\`\`json\n${JSON.stringify(agent.successCriteria, null, 2)}\n\`\`\``
            : "";

        return [
            `# ${agent.name} — Super Agente Autônomo`,
            "",
            `## Identidade`,
            agent.systemPrompt ?? `Você é ${agent.name}, um assistente especializado em vendas e atendimento.`,
            "",
            `## Objetivo Principal`,
            agent.goal ?? "Ajudar o cliente e resolver sua solicitação de forma eficiente.",
            "",
            `## Personalidade`,
            `- Tom: ${(personality["tone"] as string) ?? "amigável e profissional"}`,
            `- Estilo: ${(personality["style"] as string) ?? "consultivo"}`,
            `- Idioma: ${(personality["language"] as string) ?? "português brasileiro"}`,
            personality["instructions"] ? `- Instruções: ${String(personality["instructions"])}` : "",
            "",
            flowSection,
            rulesSection,
            requiredSection,
            handoffSection,
            criteriaSection,
            toolsSection,
            "",
            `## Instrução de Resposta — CRÍTICO`,
            `Você DEVE responder SOMENTE com um objeto JSON válido. Não inclua texto fora do JSON.`,
            `Turno atual: ${(session.turnCount ?? 0) + 1}`,
            ``,
            `Estrutura obrigatória:`,
            `\`\`\`json`,
            `{`,
            `  "observation": "O que você observa sobre a situação atual",`,
            `  "reasoning": "Seu raciocínio passo a passo sobre o que fazer",`,
            `  "intent": "intenção identificada do cliente (compra|suporte|informacao|objecao|desistencia|outro)",`,
            `  "intentConfidence": 0.0,`,
            `  "currentStep": "etapa atual do fluxo",`,
            `  "dataCollected": {},`,
            `  "pendingQuestions": [],`,
            `  "planSteps": ["passo 1", "passo 2"],`,
            `  "toolsToCall": [{"name": "nome_ferramenta", "params": {}, "reason": "motivo"}],`,
            `  "response": "Mensagem final ao cliente — clara, direta e no tom correto",`,
            `  "shouldHandoff": false,`,
            `  "handoffReason": null,`,
            `  "goalAchieved": false,`,
            `  "goalAchievedReason": null,`,
            `  "confidence": 0.0`,
            `}`,
            `\`\`\``,
            ``,
            `Regras:`,
            `- "response" é a mensagem que o cliente verá. Seja natural e conversacional.`,
            `- "toolsToCall" lista ferramentas a executar NESTE turno (máx ${MAX_TOOL_CALLS}).`,
            `- "dataCollected" inclui APENAS dados confirmados explicitamente pelo cliente.`,
            `- "confidence" de 0.0 a 1.0: sua confiança em atingir o objetivo.`,
            `- Se precisar de dados ainda não coletados, coloque as perguntas em "pendingQuestions".`,
        ]
            .filter((l) => l !== undefined)
            .join("\n");
    }

    // -------------------------------------------------------------------------
    // Step 3b: Reason + Plan (calls LLM)
    // -------------------------------------------------------------------------

    private async reasonAndPlan(
        provider: Awaited<ReturnType<typeof getAIProvider>>,
        systemPrompt: string,
        messages: ChatMessage[],
    ): Promise<{ parsed: ReActResponse | null; tokensUsed: number; raw: string }> {
        const resp = await provider.chat(messages, {
            systemPrompt,
            temperature: 0.3,
            maxTokens: 2048,
        });

        let parsed = safeJsonParse(resp.content);

        // Retry once if first parse failed
        if (!parsed) {
            const retryMessages: ChatMessage[] = [
                ...messages,
                { role: "assistant", content: resp.content },
                {
                    role: "user",
                    content:
                        "Sua resposta anterior não era um JSON válido. " +
                        "Responda APENAS com o objeto JSON, sem texto adicional.",
                },
            ];
            const retry = await provider.chat(retryMessages, {
                systemPrompt,
                temperature: 0.1,
                maxTokens: 2048,
            });
            parsed = safeJsonParse(retry.content);
            return { parsed, tokensUsed: resp.tokensUsed + retry.tokensUsed, raw: retry.content };
        }

        return { parsed, tokensUsed: resp.tokensUsed, raw: resp.content };
    }

    // -------------------------------------------------------------------------
    // Step 4: Execute Tools
    // -------------------------------------------------------------------------

    private async executeTools(
        toolsToCall: ReActResponse["toolsToCall"],
        ctx: ToolContext,
        enabledNames: string[],
    ): Promise<Array<{ name: string; result: string; success: boolean }>> {
        const results: Array<{ name: string; result: string; success: boolean }> = [];
        const called = new Set<string>();

        for (const toolCall of toolsToCall.slice(0, MAX_TOOL_CALLS)) {
            if (called.has(toolCall.name)) continue; // no duplicate calls per turn
            called.add(toolCall.name);

            if (!enabledNames.includes(toolCall.name)) {
                results.push({
                    name: toolCall.name,
                    result: `❌ Ferramenta "${toolCall.name}" não está habilitada para este agente.`,
                    success: false,
                });
                continue;
            }

            const toolResult = await toolRegistry.execute(toolCall.name, toolCall.params, ctx);
            results.push({
                name: toolCall.name,
                result: toolResult.humanReadable,
                success: toolResult.success,
            });
        }

        return results;
    }

    // -------------------------------------------------------------------------
    // Step 7: Build Handoff Data
    // -------------------------------------------------------------------------

    private buildHandoffData(opts: {
        session: {
            id: string;
            intent?: string | null;
            turnCount?: number;
            collectedData?: unknown;
            pendingQuestions?: unknown;
        };
        agent: { name: string; goal?: string | null };
        contact: { name: string | null } | null;
        contactDeals: Array<{
            title: string;
            stage: { name: string; isWon: boolean; isLost: boolean };
            pipeline: { name: string };
            value?: unknown;
        }>;
        parsed: ReActResponse;
        newCollected: Record<string, unknown>;
        handoffReason: string;
        toolResults: Array<{ name: string; result: string; success: boolean }>;
    }): Record<string, unknown> {
        const { session, agent, contact, contactDeals, parsed, newCollected, handoffReason, toolResults } = opts;

        const dealsSummary = contactDeals.map((d) => `${d.title} | ${d.pipeline.name} | ${d.stage.name}`);

        return {
            summary:
                `Atendimento conduzido por ${agent.name}. ` +
                `Intenção identificada: ${parsed.intent} (confiança: ${(parsed.intentConfidence * 100).toFixed(0)}%). ` +
                `Turnos: ${(session.turnCount ?? 0) + 1}. ` +
                `Motivo da transferência: ${handoffReason}`,
            agentName: agent.name,
            agentGoal: agent.goal,
            contactName: contact?.name,
            intent: parsed.intent,
            intentConfidence: parsed.intentConfidence,
            collectedData: newCollected,
            pendingQuestions: parsed.pendingQuestions,
            recommendedAction:
                parsed.planSteps?.length > 0
                    ? parsed.planSteps[0]
                    : "Continuar atendimento",
            urgency: parsed.intentConfidence > 0.8 ? "high" : "normal",
            nextMessage: parsed.response,
            sessionId: session.id,
            turnCount: (session.turnCount ?? 0) + 1,
            activeDeals: dealsSummary,
            toolsUsed: toolResults.map((tr) => tr.name),
            handoffReason,
            transferredAt: new Date().toISOString(),
        };
    }

    // -------------------------------------------------------------------------
    // Step 7b: Emit Socket Events
    // -------------------------------------------------------------------------

    private async emitEvents(opts: {
        finalStatus: string;
        orgId: string;
        conversationId: string;
        sessionId: string;
        agentId: string;
        contactId: string;
        response: string;
        handoffData?: Record<string, unknown>;
        goalAchievedReason?: string;
    }) {
        const { finalStatus, orgId, conversationId, sessionId, agentId, contactId, response, handoffData, goalAchievedReason } = opts;
        const io = getIO();
        if (!io) return;

        // Always emit the bot response
        io.to(`conversation:${conversationId}`).emit("message:new", {
            conversationId,
            content: response,
            type: "TEXT",
            direction: "OUTBOUND",
            sender: "bot",
            agentId,
        });

        if (finalStatus === "HANDOFF" && handoffData) {
            io.to(`org:${orgId}`).emit("agent:handoff", {
                conversationId,
                sessionId,
                agentId,
                contactId,
                ...handoffData,
            });
            fireAutomation("AGENT_HANDOFF", { conversationId, sessionId, agentId, contactId, ...handoffData }, orgId);
        }

        if (finalStatus === "ENDED") {
            io.to(`org:${orgId}`).emit("agent:goal_achieved", {
                conversationId,
                sessionId,
                agentId,
                contactId,
                reason: goalAchievedReason,
            });
            fireAutomation("AGENT_GOAL_ACHIEVED", { conversationId, sessionId, agentId, contactId, reason: goalAchievedReason }, orgId);
        }
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    private errorResult(error: string, input: SuperAgentInput): SuperAgentResult {
        return {
            sessionId: "",
            response: "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente.",
            handoff: false,
            goalAchieved: false,
            tokensUsed: 0,
            collectedData: {},
            missingDataPoints: [],
            confidence: 0,
            reasoning: error,
        };
    }
}

// Singleton instance
export const superAgentRunner = new SuperAgentRunner();

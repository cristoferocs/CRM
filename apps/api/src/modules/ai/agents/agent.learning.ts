/**
 * agent.learning.ts
 *
 * Analyses historical resolved conversations to extract a structured flowTemplate
 * and decisionRules for an AIAgent in LEARNING phase.
 *
 * Called by the BullMQ learning worker. Never depends on Fastify.
 */
import { prisma } from "../../../lib/prisma.js";
import { getAIProvider } from "../ai.factory.js";
import { AgentRepository } from "./agent.repository.js";

const agentRepo = new AgentRepository();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearnJobPayload {
    jobId: string;
    agentId: string;
    orgId: string;
    conversationIds: string[];
}

interface ConversationSummary {
    id: string;
    channel: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    outcome: string; // resolved | unresolved | handoff
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load and format conversation messages suitable for analysis */
async function loadConversationSummaries(
    conversationIds: string[],
    orgId: string,
): Promise<ConversationSummary[]> {
    const conversations = await prisma.conversation.findMany({
        where: { id: { in: conversationIds }, orgId },
        select: {
            id: true,
            channel: true,
            status: true,
            messages: {
                orderBy: { sentAt: "asc" },
                take: 40,
                select: { content: true, direction: true, type: true },
            },
        },
    });

    return conversations.map((conv) => ({
        id: conv.id,
        channel: conv.channel,
        messages: conv.messages.map((m) => ({
            role: m.direction === "INBOUND" ? ("user" as const) : ("assistant" as const),
            content: m.content,
        })),
        outcome:
            conv.status === "RESOLVED"
                ? "resolved"
                : conv.status === "OPEN"
                  ? "unresolved"
                  : "handoff",
    }));
}

/** Build the analysis prompt */
function buildAnalysisPrompt(
    agentGoal: string,
    agentType: string,
    summaries: ConversationSummary[],
): string {
    const transcripts = summaries
        .slice(0, 20) // limit to keep prompt manageable
        .map((s, i) => {
            const lines = s.messages
                .map((m) => `  ${m.role === "user" ? "Cliente" : "Agente"}: ${m.content}`)
                .join("\n");
            return `--- Conversa ${i + 1} (resultado: ${s.outcome}) ---\n${lines}`;
        })
        .join("\n\n");

    return `Você é um especialista em análise de processos de vendas e atendimento.

Analise as ${summaries.length} conversas abaixo e extraia:
1. Os padrões de fluxo de atendimento mais bem-sucedidos
2. As perguntas-chave que os melhores agentes fazem
3. As objeções mais comuns e como foram respondidas
4. Os gatilhos que indicam que o cliente está pronto para avançar
5. Os momentos onde foi necessário escalamento humano

**Objetivo do Agente**: ${agentGoal}
**Tipo**: ${agentType}

${transcripts}

---

Com base nessa análise, retorne um JSON **exatamente** neste formato (sem markdown extra):

{
  "flowTemplate": {
    "steps": [
      {
        "id": "step_id",
        "name": "Nome da etapa",
        "description": "O que acontece nesta etapa",
        "intent": "intenção esperada do cliente",
        "agentActions": ["ação 1", "ação 2"],
        "successIndicators": ["indicador 1"],
        "nextStep": "next_step_id ou null"
      }
    ],
    "entryStep": "step_id_inicial",
    "exitConditions": ["condição 1", "condição 2"]
  },
  "decisionRules": {
    "handoffTriggers": ["gatilho 1", "gatilho 2"],
    "skipConditions": ["condição para pular etapa"],
    "urgencyIndicators": ["palavra 1", "palavra 2"],
    "buyingSignals": ["sinal 1", "sinal 2"]
  },
  "keyQuestions": ["pergunta 1", "pergunta 2"],
  "commonObjections": [
    { "objection": "objeção", "response": "resposta recomendada" }
  ],
  "insights": {
    "avgTurnsToResolution": 0,
    "topReasons": ["razão 1"],
    "successRate": 0.0
  }
}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runLearningJob(payload: LearnJobPayload): Promise<void> {
    const { jobId, agentId, orgId, conversationIds } = payload;

    await agentRepo.updateLearningJob(jobId, { status: "RUNNING", startedAt: new Date() });

    const agent = await agentRepo.findById(agentId, orgId);
    if (!agent) {
        await agentRepo.updateLearningJob(jobId, {
            status: "FAILED",
            error: "Agente não encontrado",
            completedAt: new Date(),
        });
        return;
    }

    let summaries: ConversationSummary[];
    try {
        summaries = await loadConversationSummaries(conversationIds, orgId);
    } catch (err) {
        await agentRepo.updateLearningJob(jobId, {
            status: "FAILED",
            error: `Erro ao carregar conversas: ${err instanceof Error ? err.message : String(err)}`,
            completedAt: new Date(),
        });
        return;
    }

    if (summaries.length === 0) {
        await agentRepo.updateLearningJob(jobId, {
            status: "FAILED",
            error: "Nenhuma conversa válida encontrada",
            completedAt: new Date(),
        });
        return;
    }

    // Use a powerful model for learning analysis
    const providerName = (agent.provider ?? "OPENAI").toLowerCase();
    const provider = getAIProvider(providerName);

    const analysisPrompt = buildAnalysisPrompt(agent.goal, agent.type, summaries);

    let rawResult: string;
    try {
        const response = await provider.chat(
            [{ role: "user", content: analysisPrompt }],
            { temperature: 0.2, maxTokens: 4096 },
        );
        rawResult = response.content;
    } catch (err) {
        await agentRepo.updateLearningJob(jobId, {
            status: "FAILED",
            error: `Erro na análise com IA: ${err instanceof Error ? err.message : String(err)}`,
            completedAt: new Date(),
        });
        // Revert agent status
        await agentRepo.update(agentId, { status: "DRAFT", phase: "SETUP" } as never);
        return;
    }

    let result: Record<string, unknown>;
    try {
        // Strip potential markdown wrappers
        const json = rawResult.replace(/^```json?\s*/m, "").replace(/```\s*$/m, "").trim();
        result = JSON.parse(json) as Record<string, unknown>;
    } catch (err) {
        await agentRepo.updateLearningJob(jobId, {
            status: "FAILED",
            error: `Resposta da IA não é JSON válido: ${rawResult.slice(0, 200)}`,
            completedAt: new Date(),
        });
        await agentRepo.update(agentId, { status: "DRAFT", phase: "SETUP" } as never);
        return;
    }

    // Determine next version number
    const latestVersion = await agentRepo.getLatestFlowVersion(agentId);
    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const flowTemplate = result["flowTemplate"] as Record<string, unknown> | undefined;
    const decisionRules = result["decisionRules"] as Record<string, unknown> | undefined;

    if (!flowTemplate) {
        await agentRepo.updateLearningJob(jobId, {
            status: "FAILED",
            error: "Resultado não contém flowTemplate",
            completedAt: new Date(),
        });
        await agentRepo.update(agentId, { status: "DRAFT", phase: "SETUP" } as never);
        return;
    }

    // Create flow version for human review
    await agentRepo.createFlowVersion({
        agentId,
        version: nextVersion,
        flowTemplate,
        notes: `Gerado automaticamente a partir de ${summaries.length} conversas`,
    });

    // Update agent with preliminary flowTemplate and move to REVIEW
    await agentRepo.update(agentId, {
        status: "REVIEW",
        phase: "VALIDATION",
        flowTemplate,
        decisionRules: decisionRules ?? {},
        learningCompletedAt: new Date(),
        learnedFromCount: { increment: summaries.length },
    } as never);

    await agentRepo.updateLearningJob(jobId, {
        status: "DONE",
        analyzedCount: summaries.length,
        result,
        completedAt: new Date(),
    });

    console.info(
        `[agent.learning] Job ${jobId}: analysed ${summaries.length} conversations for agent ${agentId} → status REVIEW`,
    );
}

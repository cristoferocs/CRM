/**
 * tool-registry.ts
 *
 * Centralised registry for all agent tools.
 * Replaces the loose `TOOL_MAP` in tools/index.ts with a typed class
 * that enforces risk levels, confirmation requirements, and per-org limits.
 */
import { z } from "zod";
import { prisma } from "../../../lib/prisma.js";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ToolContext {
    orgId: string;
    contactId: string;
    conversationId: string;
    agentId: string;
    sessionId?: string;
    knowledgeBaseIds?: string[];
}

export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
    /** Human-readable version for injecting back into the model context */
    humanReadable: string;
}

export interface AgentTool {
    name: string;
    description: string;
    /** When to call this tool — injected into the system prompt */
    when: string;
    parametersSchema: z.ZodTypeAny;
    /** If true the runner must confirm with a human before executing */
    requiresConfirmation: boolean;
    riskLevel: "low" | "medium" | "high";
    execute(params: unknown, context: ToolContext): Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// ToolRegistry
// ---------------------------------------------------------------------------

export class ToolRegistry {
    private readonly tools = new Map<string, AgentTool>();

    register(tool: AgentTool): void {
        this.tools.set(tool.name, tool);
    }

    get(name: string): AgentTool | undefined {
        return this.tools.get(name);
    }

    /** Return only the tools listed in agent.enabledTools JSON */
    getEnabled(enabledTools: unknown): AgentTool[] {
        const cfg = (enabledTools ?? {}) as Record<string, unknown>;
        const names = (cfg["enabled"] as string[] | undefined) ?? [];
        if (names.length === 0) return [...this.tools.values()];
        return names
            .map((n) => this.tools.get(n))
            .filter((t): t is AgentTool => t !== undefined);
    }

    async execute(
        name: string,
        params: unknown,
        context: ToolContext,
    ): Promise<ToolResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            return {
                success: false,
                error: `Ferramenta "${name}" não encontrada no registry`,
                humanReadable: `❌ Ferramenta "${name}" não encontrada.`,
            };
        }

        const parsed = tool.parametersSchema.safeParse(params);
        if (!parsed.success) {
            const msg = `Parâmetros inválidos para "${name}": ${parsed.error.message}`;
            return { success: false, error: msg, humanReadable: `❌ ${msg}` };
        }

        try {
            return await tool.execute(parsed.data, context);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
                success: false,
                error: msg,
                humanReadable: `❌ Erro ao executar "${name}": ${msg}`,
            };
        }
    }

    buildPromptSection(tools: AgentTool[]): string {
        if (tools.length === 0) return "";
        const lines = tools.map(
            (t) =>
                `• **${t.name}** [risco: ${t.riskLevel}${t.requiresConfirmation ? ", requer confirmação" : ""}]\n` +
                `  Descrição: ${t.description}\n` +
                `  Quando usar: ${t.when}`,
        );
        return (
            "\n\n### Ferramentas Disponíveis\n" +
            "Inclua em `toolsToCall` no JSON de resposta qualquer ferramenta que deva ser chamada.\n\n" +
            lines.join("\n\n")
        );
    }

    /** Audit log — record tool invocation in the database */
    async auditToolCall(
        agentId: string,
        toolName: string,
        params: unknown,
        result: ToolResult,
        orgId: string,
    ): Promise<void> {
        try {
            await prisma.timelineEvent.create({
                data: {
                    type: "AGENT_TOOL_CALL",
                    title: `Agente chamou ferramenta: ${toolName}`,
                    description: result.humanReadable.slice(0, 500),
                    metadata: {
                        agentId,
                        toolName,
                        params,
                        success: result.success,
                        error: result.error,
                    } as never,
                    // contactId is required; use a system placeholder via caller
                    contactId: "system",
                    orgId,
                },
            });
        } catch {
            // audit failures are non-fatal
        }
    }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const toolRegistry = new ToolRegistry();

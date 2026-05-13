/**
 * Registry of all available agent tools.
 * Each tool exports: name, description, parametersSchema, execute().
 */
import * as getContactInfo from "./get-contact-info.tool.js";
import * as getDeals from "./get-deals.tool.js";
import * as getPayments from "./get-payments.tool.js";
import * as checkCalendar from "./check-calendar.tool.js";
import * as createAppointment from "./create-appointment.tool.js";
import * as searchKnowledge from "./search-knowledge.tool.js";
import * as updateDealStage from "./update-deal-stage.tool.js";
import * as sendPaymentLink from "./send-payment-link.tool.js";
import * as searchDrive from "./search-drive.tool.js";
import * as getServiceStatus from "./get-service-status.tool.js";
import { z } from "zod";

export interface AgentTool {
    name: string;
    description: string;
    parametersSchema: z.ZodTypeAny;
    execute(params: unknown, context: ToolContext): Promise<string>;
}

export interface ToolContext {
    orgId: string;
    contactId: string;
    conversationId: string;
    agentId: string;
    knowledgeBaseIds?: string[];
}

const ALL_TOOLS: AgentTool[] = [
    getContactInfo,
    getDeals,
    getPayments,
    checkCalendar,
    createAppointment,
    searchKnowledge as never,
    updateDealStage,
    sendPaymentLink,
    searchDrive,
    getServiceStatus,
];

const TOOL_MAP = new Map<string, AgentTool>(ALL_TOOLS.map((t) => [t.name, t]));

/**
 * Returns the tools the agent is allowed to use.
 * If no allowList configured in agent.tools, all tools are available.
 */
export function getAgentTools(enabledToolNames: string[]): AgentTool[] {
    if (enabledToolNames.length === 0) return ALL_TOOLS;
    return enabledToolNames
        .map((n) => TOOL_MAP.get(n))
        .filter((t): t is AgentTool => t !== undefined);
}

export function getTool(name: string): AgentTool | undefined {
    return TOOL_MAP.get(name);
}

export function buildToolsPromptSection(tools: AgentTool[]): string {
    if (tools.length === 0) return "";
    return (
        "\n\n### Ferramentas Disponíveis\n" +
        "Quando precisar de informações ou executar ações, use o formato JSON a seguir em uma linha separada:\n" +
        '```json\n{"tool": "<nome>", "params": {...}}\n```\n' +
        "Aguarde o resultado antes de continuar respondendo.\n\n" +
        "Ferramentas disponíveis:\n" +
        tools
            .map((t) => `• **${t.name}**: ${t.description}`)
            .join("\n")
    );
}

/**
 * Registry of all available agent tools.
 * Each tool exports: name, description, when, parametersSchema, riskLevel,
 * requiresConfirmation, execute().
 *
 * All tools are registered in the singleton ToolRegistry (tool-registry.ts)
 * at module load time. The legacy helpers below remain for backwards compat.
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
// New tools
import * as createDeal from "./create-deal.tool.js";
import * as qualifyLead from "./qualify-lead.tool.js";
import * as sendMessageTemplate from "./send-message-template.tool.js";
import * as createFollowUpTask from "./create-follow-up-task.tool.js";
import * as checkObjectionResponse from "./check-objection-response.tool.js";
import { z } from "zod";
import { toolRegistry, type AgentTool, type ToolContext, type ToolResult } from "../tool-registry.js";

export type { AgentTool, ToolContext, ToolResult };

// ---------------------------------------------------------------------------
// Wrap legacy tools (return string) into AgentTool (return ToolResult)
// ---------------------------------------------------------------------------

type LegacyTool = {
    name: string;
    description: string;
    parametersSchema: z.ZodTypeAny;
    execute(params: unknown, ctx: ToolContext): Promise<string>;
};

function wrapLegacy(
    t: LegacyTool,
    when: string,
    riskLevel: AgentTool["riskLevel"] = "low",
    requiresConfirmation = false,
): AgentTool {
    return {
        name: t.name,
        description: t.description,
        when,
        parametersSchema: t.parametersSchema,
        riskLevel,
        requiresConfirmation,
        async execute(params, ctx): Promise<ToolResult> {
            const text = await t.execute(params, ctx);
            return { success: true, data: text, humanReadable: text };
        },
    };
}

// ---------------------------------------------------------------------------
// Build full tool list and register in ToolRegistry
// ---------------------------------------------------------------------------

const LEGACY_TOOLS: AgentTool[] = [
    wrapLegacy(
        getContactInfo,
        "Use no início da conversa ou quando precisar de dados atualizados do contato.",
        "low",
    ),
    wrapLegacy(
        getDeals,
        "Use para verificar negócios em andamento antes de fazer uma proposta ou follow-up.",
        "low",
    ),
    wrapLegacy(
        getPayments,
        "Use quando o cliente perguntar sobre cobranças, faturas ou status de pagamentos.",
        "low",
    ),
    wrapLegacy(
        checkCalendar,
        "Use para oferecer horários disponíveis antes de sugerir um agendamento.",
        "low",
    ),
    wrapLegacy(
        createAppointment,
        "Use após o cliente confirmar um horário para agendar a reunião.",
        "medium",
    ),
    wrapLegacy(
        searchKnowledge as LegacyTool,
        "Use sempre que precisar de informações sobre produtos, preços, políticas ou processos.",
        "low",
    ),
    wrapLegacy(
        updateDealStage,
        "Use quando o cliente avançar no processo de compra e a fase do funil precisar ser atualizada.",
        "medium",
    ),
    wrapLegacy(
        sendPaymentLink,
        "Use quando o cliente estiver pronto para pagar e solicitar o link.",
        "high",
        true,
    ),
    wrapLegacy(
        searchDrive,
        "Use para buscar documentos, contratos ou materiais de apoio no Google Drive.",
        "low",
    ),
    wrapLegacy(
        getServiceStatus,
        "Use quando o cliente perguntar sobre o status de um serviço ou incident.",
        "low",
    ),
];

// New native tools already return ToolResult
const NATIVE_TOOLS: AgentTool[] = [
    createDeal,
    qualifyLead,
    sendMessageTemplate,
    createFollowUpTask,
    checkObjectionResponse,
];

const ALL_TOOLS: AgentTool[] = [...LEGACY_TOOLS, ...NATIVE_TOOLS];

// Register everything in singleton
for (const tool of ALL_TOOLS) {
    toolRegistry.register(tool);
}

const TOOL_MAP = new Map<string, AgentTool>(ALL_TOOLS.map((t) => [t.name, t]));

// ---------------------------------------------------------------------------
// Backwards-compat helpers (used by agent.runner.ts)
// ---------------------------------------------------------------------------

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
    return toolRegistry.buildPromptSection(tools);
}

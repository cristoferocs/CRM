import { z } from "zod";

export const automationsHealthResponseSchema = z.object({
    module: z.literal("automations"),
    status: z.literal("ok")
});

export type AutomationsHealthResponse = z.infer<typeof automationsHealthResponseSchema>;

// ---------------------------------------------------------------------------
// Trigger enum
// ---------------------------------------------------------------------------

export const triggerEnumSchema = z.enum([
    "CONTACT_CREATED",
    "CONTACT_UPDATED",
    "CONTACT_TAG_ADDED",
    "DEAL_CREATED",
    "DEAL_STAGE_CHANGED",
    "DEAL_WON",
    "DEAL_LOST",
    "DEAL_ROTTING",
    "MESSAGE_RECEIVED",
    "MESSAGE_KEYWORD",
    "CONVERSATION_OPENED",
    "CONVERSATION_RESOLVED",
    "LEAD_SCORE_CHANGED",
    "PAYMENT_RECEIVED",
    "PAYMENT_OVERDUE",
    "PAYMENT_FAILED",
    "AGENT_HANDOFF",
    "AGENT_GOAL_ACHIEVED",
    "SCHEDULED",
    "TIME_DELAY",
    "DATE_FIELD",
]);

// ---------------------------------------------------------------------------
// Per-node config schemas
// ---------------------------------------------------------------------------

const nonEmpty = (msg: string) => z.string().trim().min(1, msg);

const triggerConfigSchema = z.object({
    triggerType: triggerEnumSchema.optional(),
    keywords: z.string().optional(),
    cron: z.string().optional(),
    runAt: z.string().optional(),
    entity: z.enum(["contact", "deal"]).optional(),
    field: z.string().optional(),
    offsetMinutes: z.number().optional(),
}).passthrough();

const sendWhatsAppCfg = z.object({
    message: nonEmpty("Mensagem do WhatsApp é obrigatória"),
    templateName: z.string().optional(),
    instance: z.string().optional(),
}).passthrough();

const sendEmailCfg = z.object({
    to: z.string().optional(),
    subject: nonEmpty("Assunto é obrigatório"),
    body: nonEmpty("Corpo do e-mail é obrigatório"),
}).passthrough();

const sendSmsCfg = z.object({
    message: nonEmpty("Mensagem do SMS é obrigatória"),
    to: z.string().optional(),
}).passthrough();

const tagCfg = z.object({ tag: nonEmpty("Tag é obrigatória") }).passthrough();

const updateFieldCfg = z.object({
    target: z.enum(["contact", "deal"]).optional(),
    field: nonEmpty("Campo é obrigatório"),
    value: z.unknown(),
}).passthrough();

const createTaskCfg = z.object({
    title: nonEmpty("Título é obrigatório"),
    description: z.string().optional(),
    dueInDays: z.number().optional(),
    userId: z.string().optional(),
}).passthrough();

const notifyUserCfg = z.object({
    userId: nonEmpty("userId é obrigatório"),
    message: z.string().optional(),
    title: z.string().optional(),
}).passthrough();

const notifySlackCfg = z.object({
    webhookUrl: nonEmpty("Webhook URL do Slack é obrigatória").url("URL inválida"),
    message: z.string().optional(),
}).passthrough();

const assignOwnerCfg = z.object({
    rule: z.enum(["round_robin", "least_busy", "explicit"]).optional(),
    userId: z.string().optional(),
}).superRefine((v, ctx) => {
    if (v.rule === "explicit" && !v.userId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["userId"], message: "userId obrigatório quando rule = explicit" });
    }
});

const agentCfg = z.object({ agentId: nonEmpty("agentId é obrigatório") }).passthrough();
const movePipelineCfg = z.object({ stageId: nonEmpty("stageId é obrigatório") }).passthrough();

const delayCfg = z.object({
    amount: z.number().min(0, "amount deve ser >= 0"),
    unit: z.enum(["seconds", "minutes", "hours", "days"]).optional(),
}).passthrough();

const conditionRuleSchema = z.object({
    field: z.string(),
    operator: z.string(),
    value: z.unknown().optional(),
});

const conditionCfg = z.object({
    match: z.enum(["ALL", "ANY"]).optional(),
    rules: z.array(conditionRuleSchema).min(1, "Inclua pelo menos uma regra"),
}).passthrough();

const abTestCfg = z.object({
    splitPercent: z.number().min(1).max(99).optional(),
}).passthrough();

const webhookCfg = z.object({
    url: nonEmpty("URL é obrigatória").url("URL inválida"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
    awaitResponse: z.boolean().optional(),
}).passthrough();

const externalTriggerCfg = z.object({
    webhookUrl: nonEmpty("Webhook URL é obrigatória").url("URL inválida"),
}).passthrough();

const sentimentCfg = z.object({ lastN: z.number().optional() }).passthrough();
const scoreLeadCfg = z.object({}).passthrough();
const endCfg = z.object({}).passthrough();

const NODE_CONFIG_SCHEMAS: Record<string, z.ZodTypeAny> = {
    trigger: triggerConfigSchema,
    send_whatsapp: sendWhatsAppCfg,
    send_email: sendEmailCfg,
    send_sms: sendSmsCfg,
    add_tag: tagCfg,
    remove_tag: tagCfg,
    update_field: updateFieldCfg,
    create_task: createTaskCfg,
    notify_user: notifyUserCfg,
    notify_slack: notifySlackCfg,
    assign_owner: assignOwnerCfg,
    activate_agent: agentCfg,
    analyze_sentiment: sentimentCfg,
    score_lead: scoreLeadCfg,
    move_pipeline: movePipelineCfg,
    delay: delayCfg,
    condition: conditionCfg,
    ab_test: abTestCfg,
    webhook: webhookCfg,
    zapier_trigger: externalTriggerCfg,
    make_trigger: externalTriggerCfg,
    end: endCfg,
};

// ---------------------------------------------------------------------------
// Node / Edge schemas
// ---------------------------------------------------------------------------

const workflowNodeSchema = z.object({
    id: nonEmpty("Node id é obrigatório"),
    type: nonEmpty("Node type é obrigatório"),
    label: z.string().optional(),
    config: z.record(z.string(), z.unknown()).default({}),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
}).superRefine((node, ctx) => {
    const schema = NODE_CONFIG_SCHEMAS[node.type];
    if (!schema) return;
    const result = schema.safeParse(node.config ?? {});
    if (!result.success) {
        for (const issue of result.error.issues) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["config", ...issue.path],
                message: `[${node.id} · ${node.type}] ${issue.message}`,
            });
        }
    }
});

const workflowEdgeSchema = z.object({
    from: nonEmpty("Edge from é obrigatório"),
    to: nonEmpty("Edge to é obrigatório"),
    condition: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Automation CRUD payloads
// ---------------------------------------------------------------------------

export const createAutomationSchema = z.object({
    name: nonEmpty("Nome é obrigatório").max(120),
    description: z.string().max(500).optional(),
    triggerType: triggerEnumSchema,
    triggerConfig: z.record(z.string(), z.unknown()).optional(),
    conditions: z.array(z.unknown()).optional(),
    nodes: z.array(workflowNodeSchema).optional(),
    edges: z.array(workflowEdgeSchema).optional(),
    isActive: z.boolean().optional(),
});

export const updateAutomationSchema = createAutomationSchema.partial();

export type CreateAutomationPayload = z.infer<typeof createAutomationSchema>;
export type UpdateAutomationPayload = z.infer<typeof updateAutomationSchema>;

export function formatZodError(error: z.ZodError) {
    return {
        message: "Validação falhou",
        issues: error.issues.map(i => ({
            path: i.path.join("."),
            message: i.message,
        })),
    };
}
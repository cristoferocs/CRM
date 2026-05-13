export type InfraTier = "starter" | "growth" | "enterprise";

export type AiProvider = "google" | "anthropic" | "openai" | "ollama";

export type VectorSearchProvider = "pgvector" | "vertex";

export interface TenantBranding {
    clientName: string;
    clientSlug: string;
    primaryColor?: string;
    logoUrl?: string;
}

export interface HealthResponse {
    status: "ok";
    service: string;
    timestamp: string;
}

// =============================================================================
// Stage Automations (per-column rules for the pipeline)
// =============================================================================

export type StageAutomationTrigger = "enter" | "exit" | "rotting";

// ── Conditions (recursive AND/OR groups) ───────────────────────────────────

export type StageConditionOperator =
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "is_set"
    | "is_empty"
    | "in"
    | "not_in";

/** Fields available for condition matching against a Deal/Contact context */
export type StageConditionField =
    | "deal.value"
    | "deal.probability"
    | "deal.title"
    | "deal.ownerId"
    | "deal.rottingDays"
    | "deal.tags"
    | `deal.customFields.${string}`
    | "contact.email"
    | "contact.phone"
    | "contact.tags"
    | `contact.customFields.${string}`;

export interface StageAutomationCondition {
    kind: "condition";
    field: StageConditionField | string;
    operator: StageConditionOperator;
    value?: string | number | boolean | (string | number)[];
}

export interface StageAutomationConditionGroup {
    kind: "group";
    operator: "AND" | "OR";
    children: Array<StageAutomationCondition | StageAutomationConditionGroup>;
}

export type StageAutomationConditionNode =
    | StageAutomationCondition
    | StageAutomationConditionGroup;

// ── Actions ────────────────────────────────────────────────────────────────

export type StageAutomationActionType =
    | "send_whatsapp"
    | "send_email"
    | "create_task"
    | "assign_ai_agent"
    | "add_tag"
    | "remove_tag"
    | "notify_user"
    | "update_field"
    | "move_stage"
    | "webhook"
    | "wait";

export interface SendWhatsAppActionV2 {
    type: "send_whatsapp";
    templateId?: string;
    message: string;
}

export interface SendEmailActionV2 {
    type: "send_email";
    subject: string;
    body: string;
    fromName?: string;
    fromEmail?: string;
}

export interface CreateTaskAction {
    type: "create_task";
    title: string;
    description?: string;
    activityType?: "NOTE" | "CALL" | "EMAIL" | "MEETING" | "TASK" | "WHATSAPP";
    /** Duration after the trigger, e.g. "2d", "1h", "30m" */
    dueIn?: string;
    /** Owner override; defaults to deal owner */
    assigneeId?: string;
}

export interface AssignAIAgentAction {
    type: "assign_ai_agent";
    agentId: string;
    goal?: string;
}

export interface AddTagActionV2 {
    type: "add_tag";
    target: "contact" | "deal";
    tag: string;
}

export interface RemoveTagActionV2 {
    type: "remove_tag";
    target: "contact" | "deal";
    tag: string;
}

export interface NotifyUserAction {
    type: "notify_user";
    /** Specific userId, or "owner" to use the deal owner, or "role:MANAGER" for role-based */
    target: string;
    title: string;
    message?: string;
}

export interface UpdateFieldAction {
    type: "update_field";
    /** Whitelisted: "probability" | "ownerId" | "expectedCloseAt" | `customFields.<key>` */
    field: string;
    value: string | number | boolean | null;
}

export interface MoveStageAction {
    type: "move_stage";
    targetStageId: string;
    reason?: string;
}

export interface WebhookActionV2 {
    type: "webhook";
    url: string;
    method: "GET" | "POST" | "PUT" | "PATCH";
    headers?: Record<string, string>;
    body?: string;
}

export interface WaitActionV2 {
    type: "wait";
    /** e.g. "2d", "6h", "30m", "45s" */
    duration: string;
}

export type StageAutomationAction =
    | SendWhatsAppActionV2
    | SendEmailActionV2
    | CreateTaskAction
    | AssignAIAgentAction
    | AddTagActionV2
    | RemoveTagActionV2
    | NotifyUserAction
    | UpdateFieldAction
    | MoveStageAction
    | WebhookActionV2
    | WaitActionV2;

// ── Rules and field schemas ────────────────────────────────────────────────

export interface StageAutomationRule {
    id: string;
    name: string;
    trigger: StageAutomationTrigger;
    isActive: boolean;
    conditions?: StageAutomationConditionGroup | null;
    actions: StageAutomationAction[];
    createdAt?: string;
    updatedAt?: string;
}

export interface StageRequiredField {
    key: string;
    label: string;
    type: "text" | "number" | "date" | "select" | "boolean";
    options?: string[];
}

export interface StageAutomationLogEntry {
    id: string;
    dealId: string;
    stageId: string;
    ruleId: string;
    ruleName: string;
    trigger: StageAutomationTrigger;
    status: "SUCCESS" | "FAILED" | "SKIPPED";
    executedActions: Array<{
        actionType: StageAutomationActionType;
        success: boolean;
        output?: unknown;
        error?: string;
    }>;
    error?: string;
    createdAt: string;
}
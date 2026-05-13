// =============================================================================
// Automation — Types
// =============================================================================

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type AutomationTriggerType =
    | "contact_created"
    | "contact_updated"
    | "deal_created"
    | "deal_stage_changed"
    | "deal_won"
    | "deal_lost"
    | "message_received"
    | "time_based"
    | "payment_received";

export interface ContactCreatedTrigger {
    type: "contact_created";
    /** Optional filter: only fire when contact source matches */
    source?: string;
}

export interface ContactUpdatedTrigger {
    type: "contact_updated";
    /** Only fire when these specific fields change */
    watchFields?: string[];
}

export interface DealCreatedTrigger {
    type: "deal_created";
    pipelineId?: string;
}

export interface DealStageChangedTrigger {
    type: "deal_stage_changed";
    fromStageId?: string;
    toStageId?: string;
}

export interface DealWonTrigger {
    type: "deal_won";
    pipelineId?: string;
}

export interface DealLostTrigger {
    type: "deal_lost";
    pipelineId?: string;
}

export interface MessageReceivedTrigger {
    type: "message_received";
    channel?: "WHATSAPP" | "WHATSAPP_OFFICIAL" | "INSTAGRAM" | "FACEBOOK" | "EMAIL";
    keyword?: string;
}

export interface TimeBasedTrigger {
    type: "time_based";
    /** e.g. "2d", "6h", "30m" — delay after the event */
    delay: string;
    /** The event that starts the timer */
    baseEvent: Exclude<AutomationTriggerType, "time_based">;
}

export interface PaymentReceivedTrigger {
    type: "payment_received";
    gateway?: string;
}

export type AutomationTrigger =
    | ContactCreatedTrigger
    | ContactUpdatedTrigger
    | DealCreatedTrigger
    | DealStageChangedTrigger
    | DealWonTrigger
    | DealLostTrigger
    | MessageReceivedTrigger
    | TimeBasedTrigger
    | PaymentReceivedTrigger;

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export interface AutomationCondition {
    field: string;
    operator: "equals" | "not_equals" | "contains" | "not_contains" | "gt" | "lt" | "exists" | "not_exists";
    value?: string | number | boolean;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type AutomationActionType =
    | "send_whatsapp"
    | "send_email"
    | "add_tag"
    | "remove_tag"
    | "move_pipeline"
    | "assign_agent"
    | "create_activity"
    | "webhook"
    | "wait";

export interface SendWhatsAppAction {
    type: "send_whatsapp";
    templateId?: string;
    message: string;
    /** Variable substitutions: {{ contact.name }}, {{ deal.title }}, etc. */
    variables?: Record<string, string>;
}

export interface SendEmailAction {
    type: "send_email";
    subject: string;
    body: string;
    fromName?: string;
    fromEmail?: string;
}

export interface AddTagAction {
    type: "add_tag";
    tag: string;
}

export interface RemoveTagAction {
    type: "remove_tag";
    tag: string;
}

export interface MovePipelineAction {
    type: "move_pipeline";
    targetStageId: string;
}

export interface AssignAgentAction {
    type: "assign_agent";
    /** Agent user ID or "round_robin" for auto-assignment */
    agentId: string;
}

export interface CreateActivityAction {
    type: "create_activity";
    activityType: "NOTE" | "CALL" | "EMAIL" | "MEETING" | "TASK" | "WHATSAPP";
    title: string;
    description?: string;
    /** ISO duration e.g. "P1D" = 1 day from now */
    dueDuration?: string;
}

export interface WebhookAction {
    type: "webhook";
    url: string;
    method: "GET" | "POST" | "PUT" | "PATCH";
    headers?: Record<string, string>;
    body?: string;
}

export interface WaitAction {
    type: "wait";
    /** e.g. "2d", "6h", "30m" */
    duration: string;
}

export type AutomationAction =
    | SendWhatsAppAction
    | SendEmailAction
    | AddTagAction
    | RemoveTagAction
    | MovePipelineAction
    | AssignAgentAction
    | CreateActivityAction
    | WebhookAction
    | WaitAction;

// ---------------------------------------------------------------------------
// Event Payload
// ---------------------------------------------------------------------------

export interface AutomationEventPayload {
    trigger: AutomationTriggerType;
    orgId: string;
    contactId?: string;
    dealId?: string;
    conversationId?: string;
    paymentId?: string;
    /** Additional context data (e.g. old stage, new stage) */
    metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Job data (stored in BullMQ)
// ---------------------------------------------------------------------------

export interface AutomationJobData {
    automationId: string;
    contactId?: string;
    dealId?: string;
    conversationId?: string;
    orgId: string;
    triggeredAt: string; // ISO
    metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Execution result
// ---------------------------------------------------------------------------

export interface ActionResult {
    actionType: AutomationActionType;
    success: boolean;
    output?: unknown;
    error?: string;
}

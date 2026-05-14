import type { AutomationTriggerEnum } from "@prisma/client";

export type NodeType =
    | "trigger"
    | "end"
    | "delay"
    | "condition"
    | "ab_test"
    | "send_whatsapp"
    | "send_email"
    | "send_sms"
    | "add_tag"
    | "remove_tag"
    | "update_field"
    | "create_task"
    | "notify_user"
    | "notify_slack"
    | "assign_owner"
    | "activate_agent"
    | "analyze_sentiment"
    | "score_lead"
    | "move_pipeline"
    | "webhook"
    | "zapier_trigger"
    | "make_trigger";

export interface WorkflowNode {
    id: string;
    type: NodeType | string;
    label?: string;
    config: Record<string, unknown>;
    position?: { x: number; y: number };
}

export interface WorkflowEdge {
    from: string;
    to: string;
    condition?: string | null;
}

export interface NodeExecutionResult {
    nodeId: string;
    nodeType: string;
    success: boolean;
    output?: unknown;
    error?: string;
    durationMs?: number;
}

/** Per-namespace variables accessible inside `{{...}}` templates. */
export interface VariableBag {
    [namespace: string]: Record<string, unknown> | string | number | boolean | null | undefined;
}

export interface ExecutionContext {
    orgId: string;
    triggerType: AutomationTriggerEnum;
    triggerData: Record<string, unknown>;
    contactId?: string;
    dealId?: string;
    conversationId?: string;
    isDryRun: boolean;
    /**
     * Hydrated lookups (loaded once at the top of `execute()`).
     */
    contact: Awaited<ReturnType<typeof import("../../../lib/prisma.js").prisma.contact.findUnique>> | null;
    deal:
    | (Awaited<ReturnType<typeof import("../../../lib/prisma.js").prisma.deal.findUnique>> & {
        stage?: { id: string; name: string } | null;
    })
    | null;
    /** Map of previously executed node ids → output payload (used by `{{prev.*}}`). */
    previousOutputs: Map<string, unknown>;
    /** Variable namespaces: contact, deal, owner, org, prev, trigger. */
    variables: VariableBag;
    interpolate: (template: string) => string;
}

export type NodeExecutor = (
    node: WorkflowNode,
    ctx: ExecutionContext,
) => Promise<Pick<NodeExecutionResult, "success" | "output" | "error">>;

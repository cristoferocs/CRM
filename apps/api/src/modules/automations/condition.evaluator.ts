import type {
    StageAutomationConditionGroup,
    StageAutomationConditionNode,
    StageAutomationCondition,
} from "@crm-base/shared";

/**
 * Evaluation context — all values that conditions may reference.
 * Keys use dot notation, e.g. "deal.value", "contact.tags", "deal.customFields.budget".
 */
export interface EvaluationContext {
    deal?: {
        id: string;
        title?: string | null;
        value?: number | null;
        probability?: number | null;
        ownerId?: string | null;
        rottingDays?: number | null;
        customFields?: Record<string, unknown> | null;
        tags?: string[];
        stageId?: string;
        pipelineId?: string;
    };
    contact?: {
        id: string;
        email?: string | null;
        phone?: string | null;
        tags?: string[];
        customFields?: Record<string, unknown> | null;
    };
}

function resolveField(ctx: EvaluationContext, field: string): unknown {
    const parts = field.split(".");
    let cur: unknown = ctx;
    for (const part of parts) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
}

function compareNumbers(a: unknown, b: unknown): number | null {
    const na = typeof a === "string" ? Number(a) : a;
    const nb = typeof b === "string" ? Number(b) : b;
    if (typeof na !== "number" || typeof nb !== "number" || Number.isNaN(na) || Number.isNaN(nb)) {
        return null;
    }
    return na - nb;
}

export function evaluateCondition(
    cond: StageAutomationCondition,
    ctx: EvaluationContext,
): boolean {
    const value = resolveField(ctx, cond.field);
    const expected = cond.value;

    switch (cond.operator) {
        case "equals":
            return value === expected || String(value) === String(expected);
        case "not_equals":
            return value !== expected && String(value) !== String(expected);
        case "contains": {
            if (Array.isArray(value)) {
                return value.map(String).includes(String(expected));
            }
            if (typeof value === "string") {
                return value.toLowerCase().includes(String(expected ?? "").toLowerCase());
            }
            return false;
        }
        case "not_contains": {
            if (Array.isArray(value)) {
                return !value.map(String).includes(String(expected));
            }
            if (typeof value === "string") {
                return !value.toLowerCase().includes(String(expected ?? "").toLowerCase());
            }
            return true;
        }
        case "gt": {
            const cmp = compareNumbers(value, expected);
            return cmp !== null && cmp > 0;
        }
        case "gte": {
            const cmp = compareNumbers(value, expected);
            return cmp !== null && cmp >= 0;
        }
        case "lt": {
            const cmp = compareNumbers(value, expected);
            return cmp !== null && cmp < 0;
        }
        case "lte": {
            const cmp = compareNumbers(value, expected);
            return cmp !== null && cmp <= 0;
        }
        case "is_set":
            return value !== undefined && value !== null && value !== "";
        case "is_empty":
            return value === undefined || value === null || value === "" ||
                (Array.isArray(value) && value.length === 0);
        case "in":
            if (!Array.isArray(expected)) return false;
            return expected.map(String).includes(String(value));
        case "not_in":
            if (!Array.isArray(expected)) return true;
            return !expected.map(String).includes(String(value));
        default:
            return false;
    }
}

export function evaluateConditionGroup(
    group: StageAutomationConditionGroup | null | undefined,
    ctx: EvaluationContext,
    depth = 0,
): boolean {
    // No conditions configured → rule always fires
    if (!group) return true;
    // Recursion guard — protects against malformed deeply-nested groups
    if (depth > 5) return false;
    if (!Array.isArray(group.children) || group.children.length === 0) return true;

    const evalNode = (node: StageAutomationConditionNode): boolean => {
        if (node.kind === "condition") return evaluateCondition(node, ctx);
        return evaluateConditionGroup(node, ctx, depth + 1);
    };

    if (group.operator === "OR") return group.children.some(evalNode);
    return group.children.every(evalNode);
}

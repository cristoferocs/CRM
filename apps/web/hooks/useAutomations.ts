"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutomationNodeData {
    id: string;
    type: string;
    label?: string;
    config: Record<string, unknown>;
    position?: { x: number; y: number };
}

export interface AutomationEdgeData {
    from: string;
    to: string;
    condition?: string | null;
}

export interface AutomationSummary {
    id: string;
    name: string;
    description?: string | null;
    triggerType: string;
    isActive: boolean;
    executionCount: number;
    successCount: number;
    failureCount: number;
    lastExecutedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AutomationDetail extends AutomationSummary {
    triggerConfig: Record<string, unknown> | null;
    conditions: Array<{ field: string; operator: string; value: unknown; logic?: string }>;
    nodes: AutomationNodeData[];
    edges: AutomationEdgeData[];
}

export interface AutomationLogEntry {
    id: string;
    automationId: string;
    contactId?: string | null;
    dealId?: string | null;
    conversationId?: string | null;
    status: "success" | "partial" | "failed";
    triggerData: Record<string, unknown>;
    nodesExecuted: Array<{
        nodeId: string;
        nodeType: string;
        success: boolean;
        output?: unknown;
        error?: string;
        durationMs?: number;
    }>;
    duration: number;
    createdAt: string;
}

export interface AutomationStats {
    total: number;
    active: number;
    executions24h: number;
    successRate: number;
}

export interface AutomationTemplate {
    id: string;
    name: string;
    description: string;
    category?: string;
    triggerType: string;
    triggerConfig?: Record<string, unknown>;
    nodes: AutomationNodeData[];
    edges: AutomationEdgeData[];
}

export interface SaveAutomationInput {
    name: string;
    description?: string;
    triggerType: string;
    triggerConfig?: Record<string, unknown>;
    conditions?: Array<{ field: string; operator: string; value: unknown; logic?: string }>;
    nodes: AutomationNodeData[];
    edges: AutomationEdgeData[];
    isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useAutomations() {
    return useQuery<AutomationSummary[]>({
        queryKey: ["automations"],
        queryFn: async () => (await api.get("/automations")).data,
    });
}

export function useAutomation(id: string | undefined, enabled = true) {
    return useQuery<AutomationDetail>({
        queryKey: ["automation", id],
        queryFn: async () => (await api.get(`/automations/${id}`)).data,
        enabled: !!id && id !== "new" && enabled,
    });
}

export function useAutomationStats() {
    return useQuery<AutomationStats>({
        queryKey: ["automations", "stats"],
        queryFn: async () => (await api.get("/automations/stats")).data,
    });
}

export function useAutomationTemplates() {
    return useQuery<AutomationTemplate[]>({
        queryKey: ["automations", "templates"],
        queryFn: async () => {
            const raw = (await api.get("/automations/templates")).data as
                | AutomationTemplate[]
                | Array<{ category: string; templates: AutomationTemplate[] }>;
            if (Array.isArray(raw) && raw.length > 0 && (raw[0] as { templates?: unknown }).templates) {
                return (raw as Array<{ category: string; templates: AutomationTemplate[] }>)
                    .flatMap(g => g.templates.map(t => ({ ...t, category: g.category })));
            }
            return raw as AutomationTemplate[];
        },
    });
}

export function useAutomationLogs(id: string | undefined, params: { limit?: number; cursor?: string } = {}) {
    return useQuery<{ logs: AutomationLogEntry[]; nextCursor?: string }>({
        queryKey: ["automation", id, "logs", params],
        queryFn: async () => (await api.get(`/automations/${id}/logs`, { params })).data,
        enabled: !!id && id !== "new",
    });
}

export function useSaveAutomation(id: string | undefined) {
    const qc = useQueryClient();
    const isNew = !id || id === "new";
    return useMutation({
        mutationFn: async (input: SaveAutomationInput) => {
            if (isNew) return (await api.post("/automations", input)).data;
            return (await api.patch(`/automations/${id}`, input)).data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["automations"] });
            if (!isNew) qc.invalidateQueries({ queryKey: ["automation", id] });
        },
    });
}

export function useToggleAutomation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => (await api.patch(`/automations/${id}/toggle`)).data,
        onSuccess: (_d, id) => {
            qc.invalidateQueries({ queryKey: ["automations"] });
            qc.invalidateQueries({ queryKey: ["automation", id] });
        },
    });
}

export function useDuplicateAutomation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => (await api.post(`/automations/${id}/duplicate`)).data,
        onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
    });
}

export function useDeleteAutomation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => (await api.delete(`/automations/${id}`)).data,
        onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
    });
}

export function useTestAutomation(id: string | undefined) {
    return useMutation({
        mutationFn: async (payload: Record<string, unknown> = {}) =>
            (await api.post(`/automations/${id}/test`, { payload })).data,
    });
}

export function useInstantiateTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (template: AutomationTemplate) => {
            // Generate fresh unique ids so multiple instantiations don't clash.
            const idMap = new Map<string, string>();
            const remap = (oldId: string) => {
                if (!idMap.has(oldId)) idMap.set(oldId, `node_${Date.now()}_${Math.floor(Math.random() * 1e6)}`);
                return idMap.get(oldId)!;
            };
            const nodes = template.nodes.map(n => ({ ...n, id: remap(n.id) }));
            const edges = template.edges.map(e => ({ ...e, from: remap(e.from), to: remap(e.to) }));
            const payload: SaveAutomationInput = {
                name: template.name,
                description: template.description,
                triggerType: template.triggerType,
                triggerConfig: template.triggerConfig ?? {},
                nodes,
                edges,
                isActive: false,
            };
            return (await api.post("/automations", payload)).data as AutomationDetail;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
    });
}

// ---------------------------------------------------------------------------
// Trigger labels (shared)
// ---------------------------------------------------------------------------

export const TRIGGER_LABELS: Record<string, string> = {
    CONTACT_CREATED: "Contato criado",
    CONTACT_UPDATED: "Contato atualizado",
    CONTACT_TAG_ADDED: "Tag adicionada",
    LEAD_SCORE_CHANGED: "Score de lead alterado",
    DEAL_CREATED: "Deal criado",
    DEAL_STAGE_CHANGED: "Stage alterado",
    DEAL_WON: "Deal ganho",
    DEAL_LOST: "Deal perdido",
    DEAL_ROTTING: "Deal parado",
    MESSAGE_RECEIVED: "Mensagem recebida",
    MESSAGE_KEYWORD: "Palavra-chave em mensagem",
    CONVERSATION_OPENED: "Conversa aberta",
    CONVERSATION_RESOLVED: "Conversa resolvida",
    TIME_DELAY: "Atraso de tempo",
    SCHEDULED: "Agendamento",
    DATE_FIELD: "Data de campo",
    PAYMENT_RECEIVED: "Pagamento recebido",
    PAYMENT_OVERDUE: "Pagamento atrasado",
    PAYMENT_FAILED: "Pagamento falhou",
    AGENT_HANDOFF: "Handoff de agente",
    AGENT_GOAL_ACHIEVED: "Objetivo de agente",
};

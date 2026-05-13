import { prisma } from "../../lib/prisma.js";
import { queues } from "../../queue/queues.js";
import type { AutomationTriggerEnum } from "@prisma/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function interpolateCtx(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

function evaluateCondition(
    condition: { field: string; operator: string; value: unknown },
    data: Record<string, unknown>,
): boolean {
    const actual = data[condition.field];
    switch (condition.operator) {
        case "equals": return actual === condition.value;
        case "not_equals": return actual !== condition.value;
        case "contains": return String(actual ?? "").includes(String(condition.value ?? ""));
        case "not_contains": return !String(actual ?? "").includes(String(condition.value ?? ""));
        case "gt": return Number(actual) > Number(condition.value);
        case "lt": return Number(actual) < Number(condition.value);
        case "gte": return Number(actual) >= Number(condition.value);
        case "lte": return Number(actual) <= Number(condition.value);
        case "exists": return actual !== null && actual !== undefined;
        case "not_exists": return actual === null || actual === undefined;
        default: return false;
    }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowNode {
    id: string;
    type: string;
    label?: string;
    config: Record<string, unknown>;
    position?: { x: number; y: number };
}

export interface WorkflowEdge {
    from: string;
    to: string;
    condition?: string;
}

export interface CreateAutomationInput {
    name: string;
    description?: string;
    triggerType: AutomationTriggerEnum;
    triggerConfig?: Record<string, unknown>;
    conditions?: unknown[];
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    isActive?: boolean;
}

export interface UpdateAutomationInput {
    name?: string;
    description?: string;
    triggerType?: AutomationTriggerEnum;
    triggerConfig?: Record<string, unknown>;
    conditions?: unknown[];
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    isActive?: boolean;
}

export interface NodeExecutionResult {
    nodeId: string;
    nodeType: string;
    success: boolean;
    output?: unknown;
    error?: string;
    durationMs?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AutomationsService {

    list(orgId: string, filters?: { isActive?: boolean; triggerType?: string }) {
        return prisma.automation.findMany({
            where: {
                orgId,
                ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
                ...(filters?.triggerType ? { triggerType: filters.triggerType as AutomationTriggerEnum } : {}),
            },
            include: { _count: { select: { logs: true } } },
            orderBy: { createdAt: "desc" },
        });
    }

    findById(id: string, orgId: string) {
        return prisma.automation.findFirst({ where: { id, orgId } });
    }

    create(data: CreateAutomationInput, orgId: string) {
        return prisma.automation.create({
            data: {
                name: data.name,
                description: data.description ?? null,
                triggerType: data.triggerType,
                triggerConfig: (data.triggerConfig ?? {}) as never,
                conditions: (data.conditions ?? []) as never,
                nodes: (data.nodes ?? []) as never,
                edges: (data.edges ?? []) as never,
                isActive: data.isActive ?? false,
                orgId,
            },
        });
    }

    async update(id: string, data: UpdateAutomationInput, orgId: string) {
        const existing = await this.findById(id, orgId);
        if (!existing) throw Object.assign(new Error("Automation not found."), { statusCode: 404 });
        return prisma.automation.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.triggerType !== undefined && { triggerType: data.triggerType }),
                ...(data.triggerConfig !== undefined && { triggerConfig: data.triggerConfig as never }),
                ...(data.conditions !== undefined && { conditions: data.conditions as never }),
                ...(data.nodes !== undefined && { nodes: data.nodes as never }),
                ...(data.edges !== undefined && { edges: data.edges as never }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
            },
        });
    }

    async toggle(id: string, orgId: string) {
        const existing = await this.findById(id, orgId);
        if (!existing) throw Object.assign(new Error("Automation not found."), { statusCode: 404 });
        return prisma.automation.update({ where: { id }, data: { isActive: !existing.isActive } });
    }

    async delete(id: string, orgId: string) {
        const existing = await this.findById(id, orgId);
        if (!existing) throw Object.assign(new Error("Automation not found."), { statusCode: 404 });
        await prisma.automation.delete({ where: { id } });
    }

    async duplicate(id: string, orgId: string) {
        const existing = await this.findById(id, orgId);
        if (!existing) throw Object.assign(new Error("Automation not found."), { statusCode: 404 });
        return prisma.automation.create({
            data: {
                name: `${existing.name} (cópia)`,
                description: existing.description,
                triggerType: existing.triggerType,
                triggerConfig: existing.triggerConfig as never,
                conditions: existing.conditions as never,
                nodes: existing.nodes as never,
                edges: existing.edges as never,
                isActive: false,
                orgId,
            },
        });
    }

    async trigger(event: AutomationTriggerEnum, payload: Record<string, unknown>, orgId: string): Promise<void> {
        const automations = await prisma.automation.findMany({
            where: { orgId, isActive: true, triggerType: event },
        });
        if (automations.length === 0) return;
        const queue = queues.automations();
        for (const automation of automations) {
            const config = automation.triggerConfig as Record<string, unknown>;
            if (config?.pipelineId && payload.pipelineId !== config.pipelineId) continue;
            if (config?.stageId && payload.toStageId !== config.stageId) continue;
            const conditions = (automation.conditions as Array<{ field: string; operator: string; value: unknown; logic?: string }>) ?? [];
            if (conditions.length > 0) {
                const andResults = conditions.filter(c => c.logic !== "OR").map(c => evaluateCondition(c, payload));
                if (andResults.some(r => !r)) continue;
            }
            await queue.add(`automation:execute:${automation.id}`, {
                automationId: automation.id, orgId, triggerData: payload,
                contactId: payload.contactId, dealId: payload.dealId, conversationId: payload.conversationId,
            }, { attempts: 3, backoff: { type: "exponential", delay: 5_000 }, removeOnComplete: { count: 1000 } });
        }
    }

    async execute(automationId: string, triggerData: Record<string, unknown>, orgId: string, isDryRun = false): Promise<NodeExecutionResult[]> {
        const automation = await this.findById(automationId, orgId);
        if (!automation) throw Object.assign(new Error("Automation not found."), { statusCode: 404 });

        const startMs = Date.now();
        const nodes = (automation.nodes as unknown as WorkflowNode[]) ?? [];
        const edges = (automation.edges as unknown as WorkflowEdge[]) ?? [];
        const contactId = triggerData.contactId as string | undefined;
        const dealId = triggerData.dealId as string | undefined;

        const [contact, deal] = await Promise.all([
            contactId ? prisma.contact.findFirst({ where: { id: contactId, orgId } }) : null,
            dealId ? prisma.deal.findFirst({ where: { id: dealId, orgId }, include: { stage: true } }) : null,
        ]);

        const vars: Record<string, string> = {
            "contact.name": contact?.name ?? "", "contact.phone": contact?.phone ?? "", "contact.email": contact?.email ?? "",
            "deal.title": deal?.title ?? "", "deal.value": deal?.value?.toString() ?? "",
            "deal.stage": (deal?.stage as { name?: string })?.name ?? "",
            nome: contact?.name ?? "", empresa: (contact?.customFields as Record<string, string>)?.company ?? "",
        };

        const incomingCount = new Map<string, number>();
        for (const edge of edges) incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
        const rootNodes = nodes.filter(n => !incomingCount.has(n.id));
        const results: NodeExecutionResult[] = [];
        const queue: WorkflowNode[] = [...rootNodes];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const node = queue.shift()!;
            if (visited.has(node.id)) continue;
            visited.add(node.id);
            const nodeStart = Date.now();
            const result = await this.executeNode(node, { contactId, dealId, orgId, vars, triggerData, isDryRun });
            result.durationMs = Date.now() - nodeStart;
            results.push(result);
            const outgoing = edges.filter(e => e.from === node.id);
            for (const edge of outgoing) {
                if (node.type === "condition") {
                    const output = result.output as { result?: boolean };
                    if (edge.condition === "true" && output?.result !== true) continue;
                    if (edge.condition === "false" && output?.result !== false) continue;
                }
                const nextNode = nodes.find(n => n.id === edge.to);
                if (nextNode) queue.push(nextNode);
            }
            if (!result.success && !["condition", "ab_test"].includes(node.type)) break;
        }

        const status = results.every(r => r.success) ? "success" : results.some(r => r.success) ? "partial" : "failed";
        if (!isDryRun) {
            await Promise.all([
                prisma.automationLog.create({
                    data: {
                        automationId, contactId: contactId ?? null, dealId: dealId ?? null,
                        conversationId: (triggerData.conversationId as string) ?? null,
                        orgId, status, triggerData: triggerData as never,
                        nodesExecuted: results as never, duration: Date.now() - startMs,
                    },
                }),
                prisma.automation.update({
                    where: { id: automationId },
                    data: {
                        executionCount: { increment: 1 }, lastExecutedAt: new Date(),
                        ...(status === "success" && { successCount: { increment: 1 } }),
                        ...(status === "failed" && { failureCount: { increment: 1 } }),
                    },
                }),
            ]);
        }
        return results;
    }

    private async executeNode(node: WorkflowNode, ctx: {
        contactId?: string; dealId?: string; orgId: string; vars: Record<string, string>;
        triggerData: Record<string, unknown>; isDryRun: boolean;
    }): Promise<NodeExecutionResult> {
        const base = { nodeId: node.id, nodeType: node.type };
        const cfg = node.config;
        try {
            if (ctx.isDryRun) return { ...base, success: true, output: { dryRun: true, config: cfg } };
            switch (node.type) {
                case "trigger": return { ...base, success: true, output: { triggered: true } };
                case "end": return { ...base, success: true, output: { ended: true } };
                case "delay": {
                    const unit = String(cfg.unit ?? "minutes");
                    const amount = Number(cfg.amount ?? 0);
                    const msMap: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
                    await queues.automations().add(`automation:delayed_node:${node.id}`, ctx.triggerData,
                        { delay: amount * (msMap[unit] ?? 60_000) });
                    return { ...base, success: true, output: { delayed: true, amount, unit } };
                }
                case "condition": {
                    const field = String(cfg.field ?? "");
                    const value = ctx.triggerData[field] ?? ctx.vars[field];
                    const condResult = evaluateCondition({ field, operator: String(cfg.operator ?? "equals"), value: cfg.value }, { [field]: value });
                    return { ...base, success: true, output: { result: condResult } };
                }
                case "ab_test": {
                    const split = Number(cfg.splitPercent ?? 50);
                    const result = Math.random() * 100 < split;
                    return { ...base, success: true, output: { result, branch: result ? "A" : "B" } };
                }
                case "add_tag": {
                    if (ctx.contactId) {
                        const c = await prisma.contact.findUnique({ where: { id: ctx.contactId } });
                        if (c) await prisma.contact.update({ where: { id: ctx.contactId }, data: { tags: [...new Set([...(c.tags ?? []), String(cfg.tag)])] } });
                    }
                    return { ...base, success: true, output: { tag: cfg.tag } };
                }
                case "remove_tag": {
                    if (ctx.contactId) {
                        const c = await prisma.contact.findUnique({ where: { id: ctx.contactId } });
                        if (c) await prisma.contact.update({ where: { id: ctx.contactId }, data: { tags: (c.tags ?? []).filter(t => t !== cfg.tag) } });
                    }
                    return { ...base, success: true, output: { removed: cfg.tag } };
                }
                case "update_field": {
                    if (ctx.contactId) {
                        const c = await prisma.contact.findUnique({ where: { id: ctx.contactId } });
                        const merged = { ...(c?.customFields as Record<string, unknown> ?? {}), [String(cfg.field)]: cfg.value };
                        await prisma.contact.update({ where: { id: ctx.contactId }, data: { customFields: merged as never } });
                    }
                    return { ...base, success: true, output: { field: cfg.field, value: cfg.value } };
                }
                case "create_task": {
                    const dueAt = new Date();
                    dueAt.setDate(dueAt.getDate() + Number(cfg.dueInDays ?? 1));
                    const org = await prisma.organization.findUnique({ where: { id: ctx.orgId }, include: { users: { take: 1 } } });
                    const userId = String(cfg.userId ?? org?.users[0]?.id ?? "");
                    if (userId) await prisma.activity.create({ data: { type: "TASK", title: interpolateCtx(String(cfg.title ?? "Task"), ctx.vars), dueAt, dealId: ctx.dealId ?? null, contactId: ctx.contactId ?? null, userId, orgId: ctx.orgId } });
                    return { ...base, success: true, output: { task: cfg.title, dueAt } };
                }
                case "notify_user": {
                    const userId = String(cfg.userId ?? "");
                    if (userId) await prisma.notification.create({ data: { userId, orgId: ctx.orgId, type: "AUTOMATION_FAILED", title: "Automação", body: interpolateCtx(String(cfg.message ?? ""), ctx.vars), metadata: {} } });
                    return { ...base, success: true, output: { notified: userId } };
                }
                case "webhook": {
                    const url = String(cfg.url ?? "");
                    if (!url) return { ...base, success: false, error: "No URL" };
                    const method = String(cfg.method ?? "POST").toUpperCase();
                    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", ...((cfg.headers as Record<string, string>) ?? {}) }, body: method !== "GET" ? JSON.stringify({ ...ctx.triggerData, vars: ctx.vars }) : undefined, signal: AbortSignal.timeout(30_000) });
                    return { ...base, success: res.ok, output: { status: res.status, url } };
                }
                case "zapier_trigger": case "make_trigger": {
                    const webhookUrl = String(cfg.webhookUrl ?? "");
                    if (!webhookUrl) return { ...base, success: false, error: "No webhook URL" };
                    const res = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ctx.triggerData, vars: ctx.vars }), signal: AbortSignal.timeout(30_000) });
                    return { ...base, success: res.ok, output: { sent: true, status: res.status } };
                }
                default:
                    return { ...base, success: true, output: { queued: true, type: node.type, config: cfg } };
            }
        } catch (err) {
            return { ...base, success: false, error: String(err instanceof Error ? err.message : err) };
        }
    }

    async getLogs(automationId: string, orgId: string, page = 1, limit = 20) {
        const [logs, total] = await Promise.all([
            prisma.automationLog.findMany({ where: { automationId, orgId }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
            prisma.automationLog.count({ where: { automationId, orgId } }),
        ]);
        return { logs, total, page, limit };
    }

    async getStats(automationId: string, orgId: string) {
        const automation = await this.findById(automationId, orgId);
        if (!automation) throw Object.assign(new Error("Not found"), { statusCode: 404 });
        const successRate = automation.executionCount > 0 ? (automation.successCount / automation.executionCount) * 100 : 0;
        return { executionCount: automation.executionCount, successCount: automation.successCount, failureCount: automation.failureCount, successRate: Math.round(successRate * 100) / 100, lastExecutedAt: automation.lastExecutedAt };
    }

    getTemplates() { return AUTOMATION_TEMPLATES; }

    async testRun(id: string, payload: Record<string, unknown>, orgId: string) {
        const automation = await this.findById(id, orgId);
        if (!automation) throw Object.assign(new Error("Not found"), { statusCode: 404 });
        return this.execute(id, payload, orgId, true);
    }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const AUTOMATION_TEMPLATES = [
    {
        category: "Vendas",
        templates: [
            { id: "welcome_lead", name: "Boas-vindas ao novo lead", description: "Envia mensagem automática para novos leads", triggerType: "CONTACT_CREATED", nodes: [{ id: "n1", type: "trigger", label: "Contato criado", config: {}, position: { x: 100, y: 200 } }, { id: "n2", type: "delay", label: "Aguardar 5 min", config: { amount: 5, unit: "minutes" }, position: { x: 300, y: 200 } }, { id: "n3", type: "send_whatsapp", label: "Enviar WhatsApp", config: { message: "Oi {{nome}}! Vi que você entrou em contato. Posso te ajudar?" }, position: { x: 500, y: 200 } }, { id: "n4", type: "add_tag", label: "Tag: novo", config: { tag: "novo" }, position: { x: 700, y: 200 } }, { id: "n5", type: "create_task", label: "Tarefa: ligar", config: { title: "Ligar para o lead", dueInDays: 1 }, position: { x: 900, y: 200 } }], edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "n4" }, { from: "n4", to: "n5" }] },
            { id: "proposal_followup", name: "Follow-up de proposta", description: "Acompanha leads que receberam proposta", triggerType: "DEAL_STAGE_CHANGED", nodes: [{ id: "n1", type: "trigger", label: "Stage alterado", config: {}, position: { x: 100, y: 200 } }, { id: "n2", type: "delay", label: "2 dias", config: { amount: 2, unit: "days" }, position: { x: 300, y: 200 } }, { id: "n3", type: "send_whatsapp", label: "WA follow-up", config: { message: "Oi {{nome}}, conseguiu ver nossa proposta?" }, position: { x: 500, y: 200 } }, { id: "n4", type: "delay", label: "3 dias", config: { amount: 3, unit: "days" }, position: { x: 700, y: 200 } }, { id: "n5", type: "send_email", label: "Email follow-up", config: { subject: "Dúvidas?", body: "Olá {{nome}}, posso esclarecer alguma dúvida?" }, position: { x: 900, y: 200 } }, { id: "n6", type: "notify_user", label: "Alertar vendedor", config: { message: "Lead {{nome}} não respondeu" }, position: { x: 1100, y: 200 } }], edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "n4" }, { from: "n4", to: "n5" }, { from: "n5", to: "n6" }] },
            { id: "deal_won_celebrate", name: "Celebrar deal ganho", description: "Notifica time e envia boas-vindas ao cliente", triggerType: "DEAL_WON", nodes: [{ id: "n1", type: "trigger", label: "Deal ganho", config: {}, position: { x: 100, y: 200 } }, { id: "n2", type: "notify_team", label: "Notificar time", config: { message: "🎉 {{deal.title}} fechado!" }, position: { x: 300, y: 200 } }, { id: "n3", type: "send_whatsapp", label: "Boas-vindas", config: { message: "Parabéns, {{nome}}! Vamos iniciar." }, position: { x: 500, y: 200 } }, { id: "n4", type: "create_task", label: "Onboarding", config: { title: "Agendar onboarding", dueInDays: 1 }, position: { x: 700, y: 200 } }], edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "n4" }] },
        ],
    },
    {
        category: "Suporte",
        templates: [
            { id: "ticket_24h", name: "Ticket aberto há 24h", description: "Alerta e ativa agente para conversas sem resposta", triggerType: "TIME_DELAY", nodes: [{ id: "n1", type: "trigger", label: "24h sem resposta", config: {}, position: { x: 100, y: 200 } }, { id: "n2", type: "notify_user", label: "Notificar suporte", config: { message: "Conversa sem resposta há 24h" }, position: { x: 300, y: 200 } }, { id: "n3", type: "activate_agent", label: "Ativar agente", config: {}, position: { x: 500, y: 200 } }], edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }] },
            { id: "csat_survey", name: "Pesquisa CSAT pós-resolução", description: "Envia pesquisa após resolução", triggerType: "CONVERSATION_RESOLVED", nodes: [{ id: "n1", type: "trigger", label: "Conversa resolvida", config: {}, position: { x: 100, y: 200 } }, { id: "n2", type: "delay", label: "1 hora", config: { amount: 1, unit: "hours" }, position: { x: 300, y: 200 } }, { id: "n3", type: "send_whatsapp", label: "CSAT", config: { message: "Como foi o atendimento, {{nome}}? Responda de 1 a 5." }, position: { x: 500, y: 200 } }], edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }] },
        ],
    },
    {
        category: "Retenção",
        templates: [
            { id: "rotting_deal", name: "Reengajar lead parado", description: "Reatribui e notifica sobre deals em rotting", triggerType: "DEAL_ROTTING", nodes: [{ id: "n1", type: "trigger", label: "Deal parado", config: {}, position: { x: 100, y: 200 } }, { id: "n2", type: "assign_owner", label: "Reatribuir", config: { rule: "least_busy" }, position: { x: 300, y: 200 } }, { id: "n3", type: "notify_user", label: "Notificar", config: { message: "Deal parado há muito tempo" }, position: { x: 500, y: 200 } }, { id: "n4", type: "activate_agent", label: "Ativar agente", config: {}, position: { x: 700, y: 200 } }], edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }, { from: "n3", to: "n4" }] },
        ],
    },
];


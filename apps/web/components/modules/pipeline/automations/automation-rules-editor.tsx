"use client";

import { useState } from "react";
import {
    Plus,
    Trash2,
    ChevronDown,
    ChevronRight,
    Zap,
    LogOut,
    AlarmClock,
    Sparkles,
} from "lucide-react";
import type {
    StageAutomationRule,
    StageAutomationAction,
    StageAutomationTrigger,
    StageAutomationConditionGroup,
} from "@crm-base/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    AUTOMATION_PRESETS,
    instantiatePreset,
    type AutomationPreset,
} from "@/lib/automation-presets";

// ── Action type catalog ────────────────────────────────────────────────────────

const ACTION_TYPE_LABELS: Record<StageAutomationAction["type"], string> = {
    send_whatsapp: "Enviar WhatsApp",
    send_email: "Enviar e-mail",
    create_task: "Criar tarefa",
    assign_ai_agent: "Acionar agente de IA",
    add_tag: "Adicionar tag",
    remove_tag: "Remover tag",
    notify_user: "Notificar usuário",
    update_field: "Atualizar campo",
    move_stage: "Mover para outra etapa",
    webhook: "Disparar webhook",
    wait: "Aguardar",
};

const ACTION_TYPES: Array<StageAutomationAction["type"]> = [
    "send_whatsapp",
    "send_email",
    "create_task",
    "notify_user",
    "add_tag",
    "remove_tag",
    "assign_ai_agent",
    "update_field",
    "move_stage",
    "webhook",
    "wait",
];

function rid(): string {
    return Math.random().toString(36).slice(2, 11);
}

function defaultAction(type: StageAutomationAction["type"]): StageAutomationAction {
    switch (type) {
        case "send_whatsapp":
            return { type, message: "" };
        case "send_email":
            return { type, subject: "", body: "" };
        case "create_task":
            return { type, title: "", dueIn: "1d", activityType: "TASK" };
        case "assign_ai_agent":
            return { type, agentId: "" };
        case "add_tag":
            return { type, target: "contact", tag: "" };
        case "remove_tag":
            return { type, target: "contact", tag: "" };
        case "notify_user":
            return { type, target: "owner", title: "" };
        case "update_field":
            return { type, field: "probability", value: 50 };
        case "move_stage":
            return { type, targetStageId: "" };
        case "webhook":
            return { type, method: "POST", url: "" };
        case "wait":
            return { type, duration: "1d" };
    }
}

// ── Action editor (compact form per type) ──────────────────────────────────────

function ActionEditor({
    action,
    onChange,
    onRemove,
}: {
    action: StageAutomationAction;
    onChange: (next: StageAutomationAction) => void;
    onRemove: () => void;
}) {
    const update = <K extends keyof StageAutomationAction>(
        k: K,
        v: StageAutomationAction[K],
    ) => onChange({ ...action, [k]: v } as StageAutomationAction);

    return (
        <div className="rounded-[10px] border border-[var(--rim)] bg-surface-2 p-3 space-y-2">
            <div className="flex items-center justify-between">
                <Select
                    value={action.type}
                    onValueChange={(v) => onChange(defaultAction(v as StageAutomationAction["type"]))}
                >
                    <SelectTrigger className="h-7 w-auto min-w-[180px] text-[11px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {ACTION_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">
                                {ACTION_TYPE_LABELS[t]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <button
                    onClick={onRemove}
                    className="text-t3 hover:text-rose"
                    title="Remover ação"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>

            {action.type === "send_whatsapp" && (
                <Textarea
                    value={action.message}
                    onChange={(e) => update("message" as never, e.target.value as never)}
                    placeholder="Mensagem (use {{contact.name}}, {{deal.title}}...)"
                    rows={3}
                    className="text-xs"
                />
            )}

            {action.type === "send_email" && (
                <>
                    <Input
                        value={action.subject}
                        onChange={(e) => update("subject" as never, e.target.value as never)}
                        placeholder="Assunto"
                        className="h-7 text-xs"
                    />
                    <Textarea
                        value={action.body}
                        onChange={(e) => update("body" as never, e.target.value as never)}
                        placeholder="Corpo do e-mail"
                        rows={3}
                        className="text-xs"
                    />
                </>
            )}

            {action.type === "create_task" && (
                <>
                    <Input
                        value={action.title}
                        onChange={(e) => update("title" as never, e.target.value as never)}
                        placeholder="Título da tarefa"
                        className="h-7 text-xs"
                    />
                    <div className="flex gap-2">
                        <Input
                            value={action.dueIn ?? ""}
                            onChange={(e) => update("dueIn" as never, e.target.value as never)}
                            placeholder="Vencimento (1d, 2h, 30m)"
                            className="h-7 text-xs"
                        />
                        <Select
                            value={action.activityType ?? "TASK"}
                            onValueChange={(v) => update("activityType" as never, v as never)}
                        >
                            <SelectTrigger className="h-7 w-32 text-[11px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="TASK">Tarefa</SelectItem>
                                <SelectItem value="CALL">Ligação</SelectItem>
                                <SelectItem value="MEETING">Reunião</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </>
            )}

            {action.type === "assign_ai_agent" && (
                <>
                    <Input
                        value={action.agentId}
                        onChange={(e) => update("agentId" as never, e.target.value as never)}
                        placeholder="ID do agente"
                        className="h-7 text-xs font-mono"
                    />
                    <Textarea
                        value={action.goal ?? ""}
                        onChange={(e) => update("goal" as never, e.target.value as never)}
                        placeholder="Objetivo do agente (opcional)"
                        rows={2}
                        className="text-xs"
                    />
                </>
            )}

            {(action.type === "add_tag" || action.type === "remove_tag") && (
                <div className="flex gap-2">
                    <Select
                        value={action.target}
                        onValueChange={(v) => update("target" as never, v as never)}
                    >
                        <SelectTrigger className="h-7 w-32 text-[11px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="contact">Contato</SelectItem>
                            <SelectItem value="deal">Deal</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        value={action.tag}
                        onChange={(e) => update("tag" as never, e.target.value as never)}
                        placeholder="Nome da tag"
                        className="h-7 text-xs flex-1"
                    />
                </div>
            )}

            {action.type === "notify_user" && (
                <>
                    <Input
                        value={action.target}
                        onChange={(e) => update("target" as never, e.target.value as never)}
                        placeholder='owner, role:ADMIN, ou userId'
                        className="h-7 text-xs"
                    />
                    <Input
                        value={action.title}
                        onChange={(e) => update("title" as never, e.target.value as never)}
                        placeholder="Título da notificação"
                        className="h-7 text-xs"
                    />
                    <Input
                        value={action.message ?? ""}
                        onChange={(e) => update("message" as never, e.target.value as never)}
                        placeholder="Mensagem (opcional)"
                        className="h-7 text-xs"
                    />
                </>
            )}

            {action.type === "update_field" && (
                <div className="flex gap-2">
                    <Input
                        value={action.field}
                        onChange={(e) => update("field" as never, e.target.value as never)}
                        placeholder="probability, ownerId, customFields.foo"
                        className="h-7 text-xs flex-1 font-mono"
                    />
                    <Input
                        value={String(action.value ?? "")}
                        onChange={(e) => update("value" as never, e.target.value as never)}
                        placeholder="Valor"
                        className="h-7 text-xs w-28"
                    />
                </div>
            )}

            {action.type === "move_stage" && (
                <Input
                    value={action.targetStageId}
                    onChange={(e) => update("targetStageId" as never, e.target.value as never)}
                    placeholder="ID da etapa destino"
                    className="h-7 text-xs font-mono"
                />
            )}

            {action.type === "webhook" && (
                <>
                    <div className="flex gap-2">
                        <Select
                            value={action.method}
                            onValueChange={(v) => update("method" as never, v as never)}
                        >
                            <SelectTrigger className="h-7 w-24 text-[11px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="GET">GET</SelectItem>
                                <SelectItem value="POST">POST</SelectItem>
                                <SelectItem value="PUT">PUT</SelectItem>
                                <SelectItem value="PATCH">PATCH</SelectItem>
                                <SelectItem value="DELETE">DELETE</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            value={action.url}
                            onChange={(e) => update("url" as never, e.target.value as never)}
                            placeholder="https://..."
                            className="h-7 text-xs flex-1"
                        />
                    </div>
                    <Textarea
                        value={action.body ?? ""}
                        onChange={(e) => update("body" as never, e.target.value as never)}
                        placeholder="Body JSON (opcional)"
                        rows={2}
                        className="text-xs font-mono"
                    />
                </>
            )}

            {action.type === "wait" && (
                <Input
                    value={action.duration}
                    onChange={(e) => update("duration" as never, e.target.value as never)}
                    placeholder="Ex.: 1d, 2h, 30m, 45s"
                    className="h-7 text-xs"
                />
            )}
        </div>
    );
}

// ── Condition group editor (single-level AND/OR) ───────────────────────────────

const OPERATORS: Array<{ value: import("@crm-base/shared").StageConditionOperator; label: string }> = [
    { value: "equals", label: "=" },
    { value: "not_equals", label: "≠" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "gte", label: "≥" },
    { value: "lte", label: "≤" },
    { value: "contains", label: "contém" },
    { value: "not_contains", label: "não contém" },
    { value: "in", label: "em" },
    { value: "not_in", label: "não em" },
    { value: "is_empty", label: "vazio" },
    { value: "is_set", label: "definido" },
];

function ConditionGroupEditor({
    group,
    onChange,
}: {
    group: StageAutomationConditionGroup | null;
    onChange: (next: StageAutomationConditionGroup | null) => void;
}) {
    const enabled = !!group;
    const g: StageAutomationConditionGroup =
        group ?? { kind: "group", operator: "AND", children: [] };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Switch
                    checked={enabled}
                    onCheckedChange={(v) =>
                        onChange(v ? { kind: "group", operator: "AND", children: [] } : null)
                    }
                />
                <span className="text-xs text-t2">Aplicar somente se...</span>
            </div>

            {enabled && (
                <div className="space-y-1.5 rounded-[10px] border border-[var(--rim)] bg-surface-2 p-2.5">
                    <div className="flex items-center justify-between">
                        <Select
                            value={g.operator}
                            onValueChange={(v) =>
                                onChange({ ...g, operator: v as "AND" | "OR" })
                            }
                        >
                            <SelectTrigger className="h-6 w-20 text-[10px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="AND">E (todas)</SelectItem>
                                <SelectItem value="OR">OU (qualquer)</SelectItem>
                            </SelectContent>
                        </Select>
                        <button
                            onClick={() =>
                                onChange({
                                    ...g,
                                    children: [
                                        ...g.children,
                                        {
                                            kind: "condition",
                                            field: "deal.value",
                                            operator: "gte",
                                            value: 0,
                                        },
                                    ],
                                })
                            }
                            className="flex items-center gap-1 text-[10px] text-violet hover:underline"
                        >
                            <Plus className="h-3 w-3" /> Adicionar condição
                        </button>
                    </div>
                    {g.children.map((c, i) => {
                        if (c.kind === "group") return null; // nested groups not supported in basic UI
                        return (
                            <div key={i} className="flex items-center gap-1">
                                <Input
                                    value={c.field}
                                    onChange={(e) => {
                                        const next = [...g.children];
                                        next[i] = { ...c, field: e.target.value };
                                        onChange({ ...g, children: next });
                                    }}
                                    placeholder="deal.value"
                                    className="h-6 text-[11px] font-mono flex-1"
                                />
                                <Select
                                    value={c.operator}
                                    onValueChange={(v) => {
                                        const next = [...g.children];
                                        next[i] = { ...c, operator: v as typeof c.operator };
                                        onChange({ ...g, children: next });
                                    }}
                                >
                                    <SelectTrigger className="h-6 w-24 text-[10px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {OPERATORS.map((op) => (
                                            <SelectItem key={op.value} value={op.value} className="text-[11px]">
                                                {op.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={String(c.value ?? "")}
                                    onChange={(e) => {
                                        const next = [...g.children];
                                        next[i] = { ...c, value: e.target.value };
                                        onChange({ ...g, children: next });
                                    }}
                                    placeholder="valor"
                                    className="h-6 text-[11px] w-24"
                                />
                                <button
                                    onClick={() =>
                                        onChange({
                                            ...g,
                                            children: g.children.filter((_, j) => j !== i),
                                        })
                                    }
                                    className="text-t3 hover:text-rose"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Rule card ──────────────────────────────────────────────────────────────────

function RuleCard({
    rule,
    onChange,
    onRemove,
}: {
    rule: StageAutomationRule;
    onChange: (next: StageAutomationRule) => void;
    onRemove: () => void;
}) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="rounded-[10px] border border-[var(--rim)] bg-surface-3 p-3 space-y-3">
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="text-t3 hover:text-t1"
                >
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Input
                    value={rule.name}
                    onChange={(e) => onChange({ ...rule, name: e.target.value })}
                    placeholder="Nome da regra"
                    className="h-7 text-xs flex-1"
                />
                <div className="flex items-center gap-1.5">
                    <Switch
                        checked={rule.isActive}
                        onCheckedChange={(v) => onChange({ ...rule, isActive: v })}
                    />
                    <span className="text-[10px] text-t3">{rule.isActive ? "ON" : "OFF"}</span>
                </div>
                <button
                    onClick={onRemove}
                    className="text-t3 hover:text-rose"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>

            {expanded && (
                <>
                    <ConditionGroupEditor
                        group={rule.conditions ?? null}
                        onChange={(g) => onChange({ ...rule, conditions: g })}
                    />

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-[11px] text-t2">Ações ({rule.actions.length})</Label>
                            <button
                                onClick={() =>
                                    onChange({
                                        ...rule,
                                        actions: [...rule.actions, defaultAction("send_whatsapp")],
                                    })
                                }
                                className="flex items-center gap-1 text-[11px] text-violet hover:underline"
                            >
                                <Plus className="h-3 w-3" /> Adicionar ação
                            </button>
                        </div>
                        {rule.actions.length === 0 && (
                            <p className="text-[11px] text-t3 italic">Nenhuma ação configurada.</p>
                        )}
                        {rule.actions.map((a, i) => (
                            <ActionEditor
                                key={i}
                                action={a}
                                onChange={(next) => {
                                    const arr = [...rule.actions];
                                    arr[i] = next;
                                    onChange({ ...rule, actions: arr });
                                }}
                                onRemove={() =>
                                    onChange({
                                        ...rule,
                                        actions: rule.actions.filter((_, j) => j !== i),
                                    })
                                }
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ── Trigger section ────────────────────────────────────────────────────────────

const TRIGGER_META: Record<StageAutomationTrigger, { label: string; icon: React.ReactNode; description: string }> = {
    enter: {
        label: "Quando o deal ENTRA na etapa",
        icon: <Zap className="h-3.5 w-3.5" />,
        description: "Disparado automaticamente quando um deal é movido para esta etapa.",
    },
    exit: {
        label: "Quando o deal SAI da etapa",
        icon: <LogOut className="h-3.5 w-3.5" />,
        description: "Disparado antes do deal mudar para outra etapa.",
    },
    rotting: {
        label: "Quando o deal FICA PARADO",
        icon: <AlarmClock className="h-3.5 w-3.5" />,
        description: "Disparado quando o deal ultrapassa o limite de dias sem atividade.",
    },
};

function TriggerSection({
    trigger,
    rules,
    onChange,
}: {
    trigger: StageAutomationTrigger;
    rules: StageAutomationRule[];
    onChange: (next: StageAutomationRule[]) => void;
}) {
    const [open, setOpen] = useState(rules.length > 0);
    const meta = TRIGGER_META[trigger];

    return (
        <div className="rounded-[10px] border border-[var(--rim)] bg-surface-2">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-3"
            >
                <div className="flex items-center gap-2">
                    <span className="text-violet">{meta.icon}</span>
                    <span className="text-xs font-medium text-t1">{meta.label}</span>
                    {rules.length > 0 && (
                        <span className="rounded-[20px] bg-violet/10 px-1.5 py-px font-mono text-[10px] text-violet">
                            {rules.length}
                        </span>
                    )}
                </div>
                {open ? <ChevronDown className="h-3.5 w-3.5 text-t3" /> : <ChevronRight className="h-3.5 w-3.5 text-t3" />}
            </button>

            {open && (
                <div className="space-y-2 p-3 pt-1">
                    <p className="text-[11px] text-t3">{meta.description}</p>
                    {rules.map((rule, i) => (
                        <RuleCard
                            key={rule.id}
                            rule={rule}
                            onChange={(next) => {
                                const arr = [...rules];
                                arr[i] = next;
                                onChange(arr);
                            }}
                            onRemove={() => onChange(rules.filter((_, j) => j !== i))}
                        />
                    ))}
                    <button
                        onClick={() =>
                            onChange([
                                ...rules,
                                {
                                    id: rid(),
                                    name: "Nova regra",
                                    trigger,
                                    isActive: true,
                                    conditions: null,
                                    actions: [],
                                },
                            ])
                        }
                        className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[var(--rim)] py-2 text-[11px] text-t3 hover:border-violet/40 hover:text-violet"
                    >
                        <Plus className="h-3 w-3" /> Adicionar regra
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Preset gallery ─────────────────────────────────────────────────────────────

function PresetGallery({
    onUse,
}: {
    onUse: (preset: AutomationPreset) => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="rounded-[10px] border border-violet/20 bg-violet/[0.03]">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
                <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-violet" />
                    <span className="text-xs font-medium text-violet">
                        Galeria de automações prontas
                    </span>
                </div>
                {open ? <ChevronDown className="h-3.5 w-3.5 text-violet" /> : <ChevronRight className="h-3.5 w-3.5 text-violet" />}
            </button>
            {open && (
                <div className="grid grid-cols-2 gap-2 p-3 pt-0">
                    {AUTOMATION_PRESETS.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => onUse(p)}
                            className="rounded-[10px] border border-[var(--rim)] bg-surface-2 p-2 text-left hover:border-violet/40"
                        >
                            <div className="text-[11px] font-medium text-t1">{p.name}</div>
                            <div className="mt-0.5 line-clamp-2 text-[10px] text-t3">
                                {p.description}
                            </div>
                            <div className="mt-1.5 text-[9px] uppercase tracking-wide text-violet">
                                {p.trigger === "enter" ? "ao entrar" : p.trigger === "exit" ? "ao sair" : "ao parar"}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main editor ────────────────────────────────────────────────────────────────

export interface AutomationRulesEditorValue {
    onEnterActions: StageAutomationRule[];
    onExitActions: StageAutomationRule[];
    onRottingActions: StageAutomationRule[];
}

export function AutomationRulesEditor({
    value,
    onChange,
}: {
    value: AutomationRulesEditorValue;
    onChange: (next: AutomationRulesEditorValue) => void;
}) {
    const handlePresetUse = (preset: AutomationPreset) => {
        const rule = instantiatePreset(preset);
        const key =
            preset.trigger === "enter"
                ? "onEnterActions"
                : preset.trigger === "exit"
                    ? "onExitActions"
                    : "onRottingActions";
        onChange({ ...value, [key]: [...value[key], rule] });
    };

    return (
        <div className="space-y-3">
            <PresetGallery onUse={handlePresetUse} />

            <TriggerSection
                trigger="enter"
                rules={value.onEnterActions}
                onChange={(next) => onChange({ ...value, onEnterActions: next })}
            />
            <TriggerSection
                trigger="exit"
                rules={value.onExitActions}
                onChange={(next) => onChange({ ...value, onExitActions: next })}
            />
            <TriggerSection
                trigger="rotting"
                rules={value.onRottingActions}
                onChange={(next) => onChange({ ...value, onRottingActions: next })}
            />

            <div className="rounded-[10px] border border-[var(--rim)] bg-surface-3 px-3 py-2 text-[11px] text-t3">
                <strong className="text-t2">Dicas:</strong> use variáveis como{" "}
                <code className="text-violet">{"{{contact.name}}"}</code>,{" "}
                <code className="text-violet">{"{{deal.title}}"}</code>,{" "}
                <code className="text-violet">{"{{deal.value}}"}</code>. Durações aceitam{" "}
                <code className="text-violet">1d</code>, <code className="text-violet">2h</code>,{" "}
                <code className="text-violet">30m</code>, <code className="text-violet">45s</code>.
            </div>
        </div>
    );
}

// ── Helper: tolerant parser for legacy stage data ──────────────────────────────

export function parseRulesArray(input: unknown): StageAutomationRule[] {
    if (!Array.isArray(input)) return [];
    return input
        .filter((r): r is StageAutomationRule => {
            if (!r || typeof r !== "object") return false;
            const rec = r as Record<string, unknown>;
            return (
                typeof rec.id === "string" &&
                typeof rec.name === "string" &&
                typeof rec.trigger === "string" &&
                Array.isArray(rec.actions)
            );
        })
        .map((r) => ({
            ...r,
            isActive: r.isActive ?? true,
            conditions: r.conditions ?? null,
        }));
}

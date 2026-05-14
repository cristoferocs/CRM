"use client";

import { useRef } from "react";
import type { Node } from "@xyflow/react";
import { X, Trash2, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TRIGGER_LABELS } from "@/hooks/useAutomations";
import { getNodeDef, VARIABLE_CHIPS } from "./node-catalog";
import { ConditionRuleBuilder, type ConditionBlock } from "./ConditionRuleBuilder";

type NodeData = { label: string; type: string; config: Record<string, unknown> };

interface PropertiesPanelProps {
    node: Node<NodeData> | null;
    onChange: (id: string, patch: { label?: string; config?: Record<string, unknown> }) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}

// Reused helper for nested config setters
function setCfg(config: Record<string, unknown>, key: string, value: unknown) {
    return { ...config, [key]: value };
}

export function PropertiesPanel({ node, onChange, onDelete, onClose }: PropertiesPanelProps) {
    const lastFocusedTextarea = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

    if (!node) {
        return (
            <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--rim)] bg-surface">
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface2">
                        <GripVertical className="h-5 w-5 text-t3" />
                    </div>
                    <p className="text-sm font-medium text-t1">Nenhum nó selecionado</p>
                    <p className="text-xs text-t3">Clique em um nó do canvas para editar suas propriedades.</p>
                </div>
            </aside>
        );
    }

    const data = node.data;
    const def = getNodeDef(data.type);
    const config = data.config ?? {};

    const updateConfig = (key: string, value: unknown) => {
        onChange(node.id, { config: setCfg(config, key, value) });
    };

    // Batch-updates multiple keys atomically — prevents stale-closure overwrite
    const mergeConfig = (patch: Record<string, unknown>) => {
        onChange(node.id, { config: { ...config, ...patch } });
    };

    const insertVariable = (token: string) => {
        const el = lastFocusedTextarea.current;
        if (!el) return;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const next = el.value.slice(0, start) + token + el.value.slice(end);
        // We have no direct controlled key — best-effort: fire native event so React picks it up.
        const setter = Object.getOwnPropertyDescriptor(
            el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
            "value",
        )?.set;
        setter?.call(el, next);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = el.selectionEnd = start + token.length;
        });
    };

    const trackFocus = (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        lastFocusedTextarea.current = e.currentTarget;
    };

    return (
        <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--rim)] bg-surface">
            <header className="flex items-center justify-between gap-2 border-b border-[var(--rim)] px-4 py-3">
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-t3">Propriedades</p>
                    <p className="truncate text-sm font-semibold text-t1">{def?.label ?? data.type}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                    <X className="h-3.5 w-3.5" />
                </Button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-xs">
                <Field label="Rótulo do nó">
                    <Input
                        value={data.label ?? ""}
                        onChange={e => onChange(node.id, { label: e.target.value })}
                        className="h-8 text-xs"
                    />
                </Field>

                {/* Per-type renderers */}
                {data.type === "trigger" && <TriggerPanel config={config} onChange={updateConfig} />}
                {data.type === "send_whatsapp" && (
                    <MessagePanel
                        config={config}
                        onChange={updateConfig}
                        trackFocus={trackFocus}
                        insertVariable={insertVariable}
                        kind="whatsapp"
                    />
                )}
                {data.type === "send_email" && (
                    <EmailPanel config={config} onChange={updateConfig} trackFocus={trackFocus} insertVariable={insertVariable} />
                )}
                {data.type === "send_sms" && (
                    <MessagePanel config={config} onChange={updateConfig} trackFocus={trackFocus} insertVariable={insertVariable} kind="sms" />
                )}
                {data.type === "add_tag" && <TagPanel config={config} onChange={updateConfig} />}
                {data.type === "remove_tag" && <TagPanel config={config} onChange={updateConfig} />}
                {data.type === "update_field" && <UpdateFieldPanel config={config} onChange={updateConfig} trackFocus={trackFocus} />}
                {data.type === "create_task" && <TaskPanel config={config} onChange={updateConfig} trackFocus={trackFocus} />}
                {data.type === "notify_user" && <NotifyUserPanel config={config} onChange={updateConfig} trackFocus={trackFocus} insertVariable={insertVariable} />}
                {data.type === "notify_slack" && <NotifySlackPanel config={config} onChange={updateConfig} trackFocus={trackFocus} />}
                {data.type === "assign_owner" && <AssignOwnerPanel config={config} onChange={updateConfig} />}
                {data.type === "activate_agent" && <AgentPanel config={config} onChange={updateConfig} />}
                {data.type === "analyze_sentiment" && <SentimentPanel config={config} onChange={updateConfig} />}
                {data.type === "score_lead" && <ScoreLeadPanel />}
                {data.type === "move_pipeline" && <MovePipelinePanel config={config} onChange={updateConfig} />}
                {data.type === "delay" && <DelayPanel config={config} onChange={updateConfig} />}
                {data.type === "condition" && <ConditionPanel config={config} onMerge={mergeConfig} />}
                {data.type === "ab_test" && <AbTestPanel config={config} onChange={updateConfig} />}
                {data.type === "webhook" && <WebhookPanel config={config} onChange={updateConfig} trackFocus={trackFocus} />}
                {(data.type === "zapier_trigger" || data.type === "make_trigger") && (
                    <ExternalTriggerPanel config={config} onChange={updateConfig} trackFocus={trackFocus} />
                )}
                {data.type === "end" && (
                    <p className="rounded-md border border-dashed border-[var(--rim)] px-3 py-3 text-center text-[11px] text-t3">
                        Este nó encerra o fluxo.
                    </p>
                )}

                {/* Variable chips for textareas */}
                {hasInterpolableFields(data.type) && (
                    <Field label="Inserir variável">
                        <div className="flex flex-wrap gap-1.5">
                            {VARIABLE_CHIPS.map(v => (
                                <button
                                    key={v.value}
                                    type="button"
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => insertVariable(v.value)}
                                    className="rounded-full border border-[var(--rim)] bg-surface2 px-2 py-0.5 text-[10px] text-t2 hover:border-violet/40 hover:text-violet"
                                    title={v.value}
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>
                    </Field>
                )}
            </div>

            <footer className="border-t border-[var(--rim)] px-4 py-3">
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-red-400 hover:text-red-500"
                    onClick={() => onDelete(node.id)}
                >
                    <Trash2 className="h-3.5 w-3.5" /> Remover nó
                </Button>
            </footer>
        </aside>
    );
}

function hasInterpolableFields(type: string) {
    return [
        "send_whatsapp", "send_email", "send_sms",
        "notify_user", "notify_slack", "create_task", "webhook",
        "zapier_trigger", "make_trigger", "update_field",
    ].includes(type);
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wider text-t3">{label}</Label>
            {children}
            {hint && <p className="text-[10px] text-t3">{hint}</p>}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Per-type renderers
// ---------------------------------------------------------------------------

type Cfg = Record<string, unknown>;
type CfgProps = { config: Cfg; onChange: (key: string, value: unknown) => void };
type CfgFocusProps = CfgProps & { trackFocus: (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => void };
type CfgInsertProps = CfgFocusProps & { insertVariable: (token: string) => void };

function TriggerPanel({ config, onChange }: CfgProps) {
    return (
        <>
            <Field label="Tipo de gatilho">
                <Select value={String(config.triggerType ?? "CONTACT_CREATED")} onValueChange={v => onChange("triggerType", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                        {Object.entries(TRIGGER_LABELS).map(([k, label]) => (
                            <SelectItem key={k} value={k}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            {String(config.triggerType ?? "") === "MESSAGE_KEYWORD" && (
                <Field label="Palavras-chave (uma por linha)">
                    <Textarea
                        value={String(config.keywords ?? "")}
                        onChange={e => onChange("keywords", e.target.value)}
                        rows={3}
                        className="text-xs"
                    />
                </Field>
            )}
            {String(config.triggerType ?? "") === "SCHEDULED" && (
                <>
                    <Field label="Cron (opcional)" hint="Ex.: 0 9 * * 1 — toda segunda às 09:00">
                        <Input value={String(config.cron ?? "")} onChange={e => onChange("cron", e.target.value)} className="h-8 text-xs font-mono" />
                    </Field>
                    <Field label="Data/hora única (opcional)">
                        <Input type="datetime-local" value={String(config.runAt ?? "")} onChange={e => onChange("runAt", e.target.value)} className="h-8 text-xs" />
                    </Field>
                </>
            )}
            {String(config.triggerType ?? "") === "DATE_FIELD" && (
                <>
                    <Field label="Entidade">
                        <Select value={String(config.entity ?? "deal")} onValueChange={v => onChange("entity", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="contact">Contato</SelectItem>
                                <SelectItem value="deal">Deal</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Campo de data">
                        <Input value={String(config.field ?? "")} onChange={e => onChange("field", e.target.value)} className="h-8 text-xs" placeholder="ex.: expectedCloseDate" />
                    </Field>
                    <Field label="Deslocamento (min)">
                        <Input type="number" value={String(config.offsetMinutes ?? 0)} onChange={e => onChange("offsetMinutes", Number(e.target.value))} className="h-8 text-xs" />
                    </Field>
                </>
            )}
        </>
    );
}

function MessagePanel({ config, onChange, trackFocus, insertVariable: _i, kind }: CfgInsertProps & { kind: "whatsapp" | "sms" }) {
    return (
        <>
            <Field label="Mensagem">
                <Textarea
                    value={String(config.message ?? "")}
                    onChange={e => onChange("message", e.target.value)}
                    onFocus={trackFocus}
                    rows={6}
                    placeholder={kind === "whatsapp" ? "Olá {{contact.name}}, ..." : "SMS..."}
                    className="text-xs"
                />
            </Field>
            {kind === "whatsapp" && (
                <Field label="Template (opcional)">
                    <Input value={String(config.templateName ?? "")} onChange={e => onChange("templateName", e.target.value)} className="h-8 text-xs" />
                </Field>
            )}
        </>
    );
}

function EmailPanel({ config, onChange, trackFocus }: CfgInsertProps) {
    return (
        <>
            <Field label="Para">
                <Input value={String(config.to ?? "{{contact.email}}")} onChange={e => onChange("to", e.target.value)} onFocus={trackFocus} className="h-8 text-xs" />
            </Field>
            <Field label="Assunto">
                <Input value={String(config.subject ?? "")} onChange={e => onChange("subject", e.target.value)} onFocus={trackFocus} className="h-8 text-xs" />
            </Field>
            <Field label="Corpo">
                <Textarea value={String(config.body ?? "")} onChange={e => onChange("body", e.target.value)} onFocus={trackFocus} rows={6} className="text-xs" />
            </Field>
        </>
    );
}

function TagPanel({ config, onChange }: CfgProps) {
    return (
        <Field label="Tag">
            <Input value={String(config.tag ?? "")} onChange={e => onChange("tag", e.target.value)} className="h-8 text-xs" />
        </Field>
    );
}

function UpdateFieldPanel({ config, onChange, trackFocus }: CfgFocusProps) {
    return (
        <>
            <Field label="Alvo">
                <Select value={String(config.target ?? "contact")} onValueChange={v => onChange("target", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="contact">Contato</SelectItem>
                        <SelectItem value="deal">Deal</SelectItem>
                    </SelectContent>
                </Select>
            </Field>
            <Field label="Campo">
                <Input value={String(config.field ?? "")} onChange={e => onChange("field", e.target.value)} className="h-8 text-xs" />
            </Field>
            <Field label="Valor">
                <Input value={String(config.value ?? "")} onChange={e => onChange("value", e.target.value)} onFocus={trackFocus} className="h-8 text-xs" />
            </Field>
        </>
    );
}

function TaskPanel({ config, onChange, trackFocus }: CfgFocusProps) {
    return (
        <>
            <Field label="Título">
                <Input value={String(config.title ?? "")} onChange={e => onChange("title", e.target.value)} onFocus={trackFocus} className="h-8 text-xs" />
            </Field>
            <Field label="Descrição">
                <Textarea value={String(config.description ?? "")} onChange={e => onChange("description", e.target.value)} onFocus={trackFocus} rows={3} className="text-xs" />
            </Field>
            <Field label="Vencer em (dias)">
                <Input type="number" value={Number(config.dueInDays ?? 1)} onChange={e => onChange("dueInDays", Number(e.target.value))} className="h-8 text-xs" />
            </Field>
            <Field label="Responsável (userId)">
                <Input value={String(config.userId ?? "")} onChange={e => onChange("userId", e.target.value)} className="h-8 text-xs" />
            </Field>
        </>
    );
}

function NotifyUserPanel({ config, onChange, trackFocus }: CfgInsertProps) {
    return (
        <>
            <Field label="Usuário (userId)">
                <Input value={String(config.userId ?? "")} onChange={e => onChange("userId", e.target.value)} className="h-8 text-xs" />
            </Field>
            <Field label="Mensagem">
                <Textarea value={String(config.message ?? "")} onChange={e => onChange("message", e.target.value)} onFocus={trackFocus} rows={3} className="text-xs" />
            </Field>
        </>
    );
}

function NotifySlackPanel({ config, onChange, trackFocus }: CfgFocusProps) {
    return (
        <>
            <Field label="Webhook URL">
                <Input value={String(config.webhookUrl ?? "")} onChange={e => onChange("webhookUrl", e.target.value)} className="h-8 text-xs" />
            </Field>
            <Field label="Mensagem">
                <Textarea value={String(config.message ?? "")} onChange={e => onChange("message", e.target.value)} onFocus={trackFocus} rows={3} className="text-xs" />
            </Field>
        </>
    );
}

function AssignOwnerPanel({ config, onChange }: CfgProps) {
    return (
        <>
            <Field label="Regra">
                <Select value={String(config.rule ?? "round_robin")} onValueChange={v => onChange("rule", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="round_robin">Rotativo</SelectItem>
                        <SelectItem value="least_busy">Menos ocupado</SelectItem>
                        <SelectItem value="explicit">Usuário específico</SelectItem>
                    </SelectContent>
                </Select>
            </Field>
            {String(config.rule ?? "") === "explicit" && (
                <Field label="UserId">
                    <Input value={String(config.userId ?? "")} onChange={e => onChange("userId", e.target.value)} className="h-8 text-xs" />
                </Field>
            )}
        </>
    );
}

function AgentPanel({ config, onChange }: CfgProps) {
    return (
        <Field label="Agent ID">
            <Input value={String(config.agentId ?? "")} onChange={e => onChange("agentId", e.target.value)} className="h-8 text-xs" />
        </Field>
    );
}

function SentimentPanel({ config, onChange }: CfgProps) {
    return (
        <Field label="Mensagens a analisar">
            <Input type="number" value={Number(config.lastN ?? 5)} onChange={e => onChange("lastN", Number(e.target.value))} className="h-8 text-xs" />
        </Field>
    );
}

function ScoreLeadPanel() {
    return (
        <p className="rounded-md border border-dashed border-[var(--rim)] px-3 py-3 text-[11px] text-t3">
            Recalcula o score do contato e persiste o resultado.
        </p>
    );
}

function MovePipelinePanel({ config, onChange }: CfgProps) {
    return (
        <Field label="Stage destino (stageId)">
            <Input value={String(config.stageId ?? "")} onChange={e => onChange("stageId", e.target.value)} className="h-8 text-xs" />
        </Field>
    );
}

function DelayPanel({ config, onChange }: CfgProps) {
    return (
        <div className="grid grid-cols-2 gap-2">
            <Field label="Quantidade">
                <Input type="number" min={0} value={Number(config.amount ?? 1)} onChange={e => onChange("amount", Number(e.target.value))} className="h-8 text-xs" />
            </Field>
            <Field label="Unidade">
                <Select value={String(config.unit ?? "minutes")} onValueChange={v => onChange("unit", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="seconds">Segundos</SelectItem>
                        <SelectItem value="minutes">Minutos</SelectItem>
                        <SelectItem value="hours">Horas</SelectItem>
                        <SelectItem value="days">Dias</SelectItem>
                    </SelectContent>
                </Select>
            </Field>
        </div>
    );
}

// Uses onMerge (single atomic call) to update match + rules together,
// preventing the stale-closure bug where two sequential onChange calls
// each capture the old config and the second overwrites the first.
function ConditionPanel({ config, onMerge }: { config: Cfg; onMerge: (patch: Cfg) => void }) {
    const block: ConditionBlock = {
        match: (config.match as "ALL" | "ANY") ?? "ALL",
        rules: Array.isArray(config.rules) ? (config.rules as ConditionBlock["rules"]) : [],
    };
    return (
        <Field label="Condições">
            <ConditionRuleBuilder
                value={block}
                onChange={next => onMerge({ match: next.match, rules: next.rules })}
            />
            <div className="mt-2 flex items-center gap-2">
                <Badge variant="outline" className="gap-1.5 text-[10px]">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
                    Saída true
                </Badge>
                <Badge variant="outline" className="gap-1.5 text-[10px]">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                    Saída false
                </Badge>
            </div>
        </Field>
    );
}

function AbTestPanel({ config, onChange }: CfgProps) {
    const pct = Number(config.splitPercent ?? 50);
    return (
        <>
            <Field label={`Grupo A: ${pct}%  ·  Grupo B: ${100 - pct}%`}>
                <input
                    type="range" min={1} max={99}
                    value={pct}
                    onChange={e => onChange("splitPercent", Number(e.target.value))}
                    className="w-full accent-violet-500"
                />
                <div className="flex justify-between text-[10px] text-t3">
                    <span>1%</span><span>50%</span><span>99%</span>
                </div>
            </Field>
            <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">Saída A — {pct}%</Badge>
                <Badge variant="outline" className="text-[10px]">Saída B — {100 - pct}%</Badge>
            </div>
        </>
    );
}

function WebhookPanel({ config, onChange, trackFocus }: CfgFocusProps) {
    return (
        <>
            <Field label="URL">
                <Input value={String(config.url ?? "")} onChange={e => onChange("url", e.target.value)} onFocus={trackFocus} className="h-8 text-xs" />
            </Field>
            <Field label="Método">
                <Select value={String(config.method ?? "POST")} onValueChange={v => onChange("method", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                    </SelectContent>
                </Select>
            </Field>
            <Field label="Aguardar resposta">
                <div className="flex items-center justify-between rounded-md border border-[var(--rim)] px-3 py-1.5">
                    <span className="text-xs text-t2">Bloquear até retorno</span>
                    <Switch checked={!!config.awaitResponse} onCheckedChange={v => onChange("awaitResponse", v)} />
                </div>
            </Field>
        </>
    );
}

function ExternalTriggerPanel({ config, onChange, trackFocus }: CfgFocusProps) {
    return (
        <Field label="Webhook URL" hint="URL fornecida pelo Zapier/Make">
            <Input value={String(config.webhookUrl ?? "")} onChange={e => onChange("webhookUrl", e.target.value)} onFocus={trackFocus} className="h-8 text-xs" />
        </Field>
    );
}

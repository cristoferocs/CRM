"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types & catalogs
// ---------------------------------------------------------------------------

export interface ConditionRule {
    field: string;
    operator: string;
    value: string | number | boolean | null;
    logic?: "AND" | "OR";
}

export interface ConditionBlock {
    match: "ALL" | "ANY";
    rules: ConditionRule[];
}

const OPERATORS: { value: string; label: string; valueless?: boolean }[] = [
    { value: "equals", label: "é igual a" },
    { value: "not_equals", label: "é diferente de" },
    { value: "contains", label: "contém" },
    { value: "not_contains", label: "não contém" },
    { value: "gt", label: "maior que" },
    { value: "gte", label: "maior ou igual" },
    { value: "lt", label: "menor que" },
    { value: "lte", label: "menor ou igual" },
    { value: "is_set", label: "está preenchido", valueless: true },
    { value: "is_empty", label: "está vazio", valueless: true },
    { value: "in", label: "está em" },
    { value: "not_in", label: "não está em" },
];

const FIELD_PRESETS = [
    { group: "Contato", value: "contact.name", label: "Nome" },
    { group: "Contato", value: "contact.email", label: "E-mail" },
    { group: "Contato", value: "contact.phone", label: "Telefone" },
    { group: "Contato", value: "contact.tags", label: "Tags" },
    { group: "Contato", value: "contact.leadScore", label: "Score" },
    { group: "Contato", value: "contact.source", label: "Origem" },
    { group: "Deal", value: "deal.value", label: "Valor do deal" },
    { group: "Deal", value: "deal.stage", label: "Stage" },
    { group: "Deal", value: "deal.title", label: "Título" },
    { group: "Mensagem", value: "trigger.content", label: "Conteúdo da mensagem" },
    { group: "Mensagem", value: "trigger.channel", label: "Canal" },
];

const DATALIST_ID = "condition-field-presets";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
    value: ConditionBlock;
    onChange: (v: ConditionBlock) => void;
    allowMatchToggle?: boolean;
}

export function ConditionRuleBuilder({ value, onChange, allowMatchToggle = true }: Props) {
    const update = (patch: Partial<ConditionBlock>) => onChange({ ...value, ...patch });
    const updateRule = (idx: number, patch: Partial<ConditionRule>) => {
        const rules = value.rules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
        update({ rules });
    };
    const addRule = () => update({ rules: [...value.rules, { field: "", operator: "equals", value: "" }] });
    const removeRule = (idx: number) => update({ rules: value.rules.filter((_, i) => i !== idx) });

    return (
        <div className="flex flex-col gap-2">
            {/* Datalist for free-text field input with preset suggestions */}
            <datalist id={DATALIST_ID}>
                {FIELD_PRESETS.map(f => (
                    <option key={f.value} value={f.value}>{f.group}: {f.label}</option>
                ))}
            </datalist>

            {allowMatchToggle && (
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-t3">Atender</span>
                    <Select value={value.match} onValueChange={(v: "ALL" | "ANY") => update({ match: v })}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">TODAS</SelectItem>
                            <SelectItem value="ANY">QUALQUER</SelectItem>
                        </SelectContent>
                    </Select>
                    <span className="text-t3">das condições</span>
                </div>
            )}

            <div className="flex flex-col gap-2">
                {value.rules.length === 0 && (
                    <p className="rounded-md border border-dashed border-[var(--rim)] px-3 py-2 text-center text-[11px] text-t3">
                        Sem condições — clique em &quot;Adicionar&quot;.
                    </p>
                )}
                {value.rules.map((rule, idx) => {
                    const op = OPERATORS.find(o => o.value === rule.operator);
                    return (
                        // Stacked layout: row 1 = field + operator; row 2 = value + delete
                        <div key={idx} className="rounded-md border border-[var(--rim)] bg-surface2/40 p-2">
                            {/* Row 1: field | operator */}
                            <div className="mb-1.5 grid grid-cols-2 gap-1.5">
                                <Input
                                    list={DATALIST_ID}
                                    value={rule.field}
                                    onChange={e => updateRule(idx, { field: e.target.value })}
                                    placeholder="Campo..."
                                    className="h-7 text-xs"
                                />
                                <Select value={rule.operator} onValueChange={v => updateRule(idx, { operator: v })}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {OPERATORS.map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {/* Row 2: value | remove */}
                            <div className="flex items-center gap-1.5">
                                <Input
                                    value={op?.valueless ? "" : String(rule.value ?? "")}
                                    disabled={op?.valueless}
                                    onChange={e => updateRule(idx, { value: e.target.value })}
                                    placeholder={op?.valueless ? "(sem valor)" : "Valor..."}
                                    className="h-7 flex-1 text-xs"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 text-red-400 hover:text-red-500"
                                    onClick={() => removeRule(idx)}
                                    title="Remover regra"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <Button variant="outline" size="sm" className="h-7 gap-1.5 self-start text-xs" onClick={addRule}>
                <Plus className="h-3 w-3" /> Adicionar
            </Button>
        </div>
    );
}

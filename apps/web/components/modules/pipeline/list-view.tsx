"use client";

import { useState } from "react";
import { ArrowUpDown, Bot, Flame, ExternalLink } from "lucide-react";
import { cn, formatCurrency, formatRelative, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { differenceInDays } from "date-fns";
import type { PipelineDeal, PipelineStage } from "@/hooks/usePipeline";

type SortKey = "title" | "value" | "aiProbability" | "stageEnteredAt" | "lastActivityAt";
type SortDir = "asc" | "desc";

interface ListViewProps {
    deals: PipelineDeal[];
    stages: PipelineStage[];
    onDealClick: (deal: PipelineDeal) => void;
}

const AVATAR_COLORS = [
    "from-violet to-cyan",
    "from-cyan to-jade",
    "from-jade to-cyan",
    "from-rose to-amber",
    "from-amber to-violet",
];

function avatarColor(str: string): string {
    let hash = 0;
    for (const c of str) hash = hash * 31 + c.charCodeAt(0);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] as string;
}

export function ListView({ deals, stages, onDealClick }: ListViewProps) {
    const [sortKey, setSortKey] = useState<SortKey>("lastActivityAt");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const stageMap = new Map(stages.map((s) => [s.id, s]));

    const sorted = [...deals].sort((a, b) => {
        let diff = 0;
        if (sortKey === "title") diff = a.title.localeCompare(b.title);
        else if (sortKey === "value") diff = (a.value ?? 0) - (b.value ?? 0);
        else if (sortKey === "aiProbability") diff = (a.aiProbability ?? a.probability ?? 0) - (b.aiProbability ?? b.probability ?? 0);
        else if (sortKey === "stageEnteredAt") diff = new Date(a.stageEnteredAt).getTime() - new Date(b.stageEnteredAt).getTime();
        else if (sortKey === "lastActivityAt") diff = new Date(a.lastActivityAt ?? 0).getTime() - new Date(b.lastActivityAt ?? 0).getTime();
        return sortDir === "asc" ? diff : -diff;
    });

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else { setSortKey(key); setSortDir("desc"); }
    };

    const toggleSelect = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelected(selected.size === sorted.length ? new Set() : new Set(sorted.map((d) => d.id)));
    };

    const ColHeader = ({ colKey, label }: { colKey: SortKey; label: string }) => (
        <th className="px-3 py-2.5 text-left">
            <button
                onClick={() => toggleSort(colKey)}
                className="flex items-center gap-1 font-medium text-t3 hover:text-t2"
            >
                {label}
                <ArrowUpDown className={cn("h-3 w-3", sortKey === colKey ? "text-violet" : "opacity-40")} />
            </button>
        </th>
    );

    return (
        <div className="overflow-auto rounded-[12px] border border-[var(--rim)] bg-surface-2">
            {/* Bulk actions bar */}
            {selected.size > 0 && (
                <div className="flex items-center gap-3 border-b border-[var(--rim)] bg-violet/[0.06] px-4 py-2">
                    <span className="text-xs font-medium text-violet">{selected.size} selecionado(s)</span>
                    <button className="text-xs text-t2 hover:text-t1">Mover</button>
                    <button className="text-xs text-t2 hover:text-t1">Reatribuir</button>
                    <button className="text-xs text-rose hover:text-rose/70">Arquivar</button>
                    <button className="ml-auto text-xs text-t3 hover:text-t1" onClick={() => setSelected(new Set())}>
                        Cancelar
                    </button>
                </div>
            )}

            <table className="w-full min-w-[900px] text-xs">
                <thead>
                    <tr className="border-b border-[var(--rim)] bg-surface-3">
                        <th className="w-8 px-3 py-2.5">
                            <input
                                type="checkbox"
                                checked={selected.size === sorted.length && sorted.length > 0}
                                onChange={toggleAll}
                                className="h-3.5 w-3.5 accent-violet"
                            />
                        </th>
                        <ColHeader colKey="title" label="Deal" />
                        <th className="px-3 py-2.5 text-left font-medium text-t3">Contato</th>
                        <th className="px-3 py-2.5 text-left font-medium text-t3">Etapa</th>
                        <ColHeader colKey="value" label="Valor" />
                        <ColHeader colKey="aiProbability" label="Prob." />
                        <ColHeader colKey="stageEnteredAt" label="Na etapa" />
                        <ColHeader colKey="lastActivityAt" label="Última ativ." />
                        <th className="px-3 py-2.5 text-left font-medium text-t3">Flags</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((deal) => {
                        const stage = stageMap.get(deal.stageId);
                        const daysInStage = differenceInDays(new Date(), new Date(deal.stageEnteredAt));
                        const prob = deal.aiProbability ?? deal.probability;

                        return (
                            <tr
                                key={deal.id}
                                onClick={() => onDealClick(deal)}
                                className={cn(
                                    "cursor-pointer border-b border-[var(--rim)] last:border-0 transition-colors hover:bg-surface-3",
                                    selected.has(deal.id) && "bg-violet/[0.04]",
                                )}
                            >
                                {/* Checkbox */}
                                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selected.has(deal.id)}
                                        onChange={() => toggleSelect(deal.id)}
                                        className="h-3.5 w-3.5 accent-violet"
                                    />
                                </td>

                                {/* Title */}
                                <td className="max-w-[200px] px-3 py-2.5">
                                    <p className="truncate font-medium text-t1">{deal.title}</p>
                                    {deal.utmSource && (
                                        <p className="truncate font-mono text-[10px] text-t3">
                                            {deal.utmSource}
                                        </p>
                                    )}
                                </td>

                                {/* Contact */}
                                <td className="px-3 py-2.5">
                                    {deal.contact ? (
                                        <div className="flex items-center gap-1.5">
                                            <Avatar className="h-5 w-5 shrink-0">
                                                {deal.contact.avatar && <AvatarImage src={deal.contact.avatar} />}
                                                <AvatarFallback
                                                    className={cn("text-[7px] font-bold bg-gradient-to-br", avatarColor(deal.contact.id))}
                                                >
                                                    {getInitials(deal.contact.name, 2)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span className="max-w-[120px] truncate text-t2">{deal.contact.name}</span>
                                        </div>
                                    ) : (
                                        <span className="text-t3">—</span>
                                    )}
                                </td>

                                {/* Stage */}
                                <td className="px-3 py-2.5">
                                    {stage ? (
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className="h-1.5 w-1.5 rounded-full"
                                                style={{ backgroundColor: stage.color }}
                                            />
                                            <span className="text-t2">{stage.name}</span>
                                        </div>
                                    ) : (
                                        <span className="text-t3">—</span>
                                    )}
                                </td>

                                {/* Value */}
                                <td className="px-3 py-2.5 font-mono">
                                    {deal.value ? (
                                        <span className="text-jade">{formatCurrency(deal.value, { compact: true })}</span>
                                    ) : (
                                        <span className="text-t3">—</span>
                                    )}
                                </td>

                                {/* Probability */}
                                <td className="px-3 py-2.5">
                                    {prob != null ? (
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-1 w-12 overflow-hidden rounded-full bg-surface-3">
                                                <div
                                                    className="h-full rounded-full bg-jade"
                                                    style={{ width: `${prob}%` }}
                                                />
                                            </div>
                                            <span className="font-mono text-[10px] text-t2">{prob}%</span>
                                        </div>
                                    ) : (
                                        <span className="text-t3">—</span>
                                    )}
                                </td>

                                {/* Days in stage */}
                                <td className="px-3 py-2.5 font-mono">
                                    <span className={cn(
                                        deal.isRotting ? "text-amber" : "text-t2",
                                    )}>
                                        {daysInStage}d
                                    </span>
                                </td>

                                {/* Last activity */}
                                <td className="px-3 py-2.5 text-t3">
                                    {deal.lastActivityAt ? formatRelative(deal.lastActivityAt) : "—"}
                                </td>

                                {/* Flags */}
                                <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-1">
                                        {deal.isRotting && (
                                            <span title="Deal parado">
                                                <Flame className="h-3.5 w-3.5 text-amber" />
                                            </span>
                                        )}
                                        {deal.activeAgentSessionId && (
                                            <span title="Agente ativo">
                                                <Bot className="h-3.5 w-3.5 text-violet" />
                                            </span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    {sorted.length === 0 && (
                        <tr>
                            <td colSpan={9} className="py-12 text-center text-t3">
                                Nenhum deal encontrado com os filtros aplicados.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

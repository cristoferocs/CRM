"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NODE_CATALOG, NODE_CATEGORIES, type NodeDef } from "./node-catalog";

interface NodeLibraryProps {
    onAddNode?: (def: NodeDef) => void;
}

export function NodeLibrary({ onAddNode }: NodeLibraryProps) {
    const [search, setSearch] = useState("");
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const groups = useMemo(() => {
        const term = search.trim().toLowerCase();
        return NODE_CATEGORIES.map(category => ({
            category,
            items: NODE_CATALOG.filter(n =>
                n.category === category &&
                (!term || n.label.toLowerCase().includes(term) || n.description.toLowerCase().includes(term)),
            ),
        })).filter(g => g.items.length > 0);
    }, [search]);

    return (
        <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--rim)] bg-surface">
            <div className="flex flex-col gap-3 border-b border-[var(--rim)] px-4 py-4">
                <h3 className="text-sm font-semibold text-t1">Biblioteca de Nós</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t3" />
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar nó..."
                        className="h-8 pl-8 text-xs"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
                {groups.map(group => {
                    const isCollapsed = collapsed[group.category];
                    return (
                        <div key={group.category} className="mb-4 last:mb-0">
                            <button
                                type="button"
                                onClick={() => setCollapsed(c => ({ ...c, [group.category]: !c[group.category] }))}
                                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-t3 hover:text-t1"
                            >
                                <span>{group.category}</span>
                                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            {!isCollapsed && (
                                <div className="mt-1 flex flex-col gap-1">
                                    {group.items.map(def => {
                                        const Icon = def.icon;
                                        return (
                                            <div
                                                key={def.type}
                                                draggable
                                                onDragStart={e => {
                                                    e.dataTransfer.setData("application/x-automation-node", def.type);
                                                    e.dataTransfer.effectAllowed = "move";
                                                }}
                                                onDoubleClick={() => onAddNode?.(def)}
                                                className={cn(
                                                    "group/node flex cursor-grab items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 transition-all hover:border-[var(--rim)] hover:bg-surface2 active:cursor-grabbing",
                                                )}
                                                title={def.description}
                                            >
                                                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", def.bgClass)}>
                                                    <Icon className={cn("h-3.5 w-3.5", def.textClass)} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-xs font-medium text-t1">{def.label}</p>
                                                    <p className="truncate text-[10px] text-t3">{def.description}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {groups.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-t3">Nenhum nó encontrado</p>
                )}
            </div>

            <div className="border-t border-[var(--rim)] bg-surface2/40 px-4 py-3">
                <p className="text-[10px] leading-relaxed text-t3">
                    Arraste um nó para o canvas, ou clique duplo para adicioná-lo automaticamente.
                </p>
            </div>
        </aside>
    );
}

"use client";

import { useState } from "react";
import { Search, Flame, Bot, X, Kanban, List, BarChart2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TagAutocomplete, type TagOption } from "@/components/ui/tag-autocomplete";
import { useTags } from "@/hooks/useTags";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ViewMode = "kanban" | "list" | "funnel";

export interface FilterState {
    search: string;
    isRotting: boolean;
    hasAgent: boolean;
    ownerId: string | null;
    /** Selected tag ids — joined to a CSV when sent to the API. */
    tagIds: string[];
    view: ViewMode;
}

export const DEFAULT_FILTERS: FilterState = {
    search: "",
    isRotting: false,
    hasAgent: false,
    ownerId: null,
    tagIds: [],
    view: "kanban",
};

// ── View tab config ────────────────────────────────────────────────────────────

const VIEWS: { id: ViewMode; icon: React.ReactNode; label: string }[] = [
    { id: "kanban", icon: <Kanban className="h-3.5 w-3.5" />, label: "Kanban" },
    { id: "list", icon: <List className="h-3.5 w-3.5" />, label: "Lista" },
    { id: "funnel", icon: <BarChart2 className="h-3.5 w-3.5" />, label: "Funil" },
];

// ── Props ──────────────────────────────────────────────────────────────────────

interface FilterBarProps {
    filters: FilterState;
    onFiltersChange: (next: FilterState) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
    const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
        onFiltersChange({ ...filters, [k]: v });

    const [tagSearch, setTagSearch] = useState("");
    const { data: tagOptions = [] } = useTags({ search: tagSearch, limit: 50 });
    const selectedTags: TagOption[] = filters.tagIds
        .map((id) => tagOptions.find((t) => t.id === id))
        .filter((t): t is TagOption => !!t);

    const isAnyFilterActive = filters.search || filters.isRotting || filters.hasAgent ||
        filters.ownerId || filters.tagIds.length > 0;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t3" />
                <Input
                    placeholder="Buscar deal..."
                    value={filters.search}
                    onChange={(e) => set("search", e.target.value)}
                    className="h-8 w-48 pl-8 text-xs"
                />
            </div>

            {/* Rotting toggle */}
            <button
                onClick={() => set("isRotting", !filters.isRotting)}
                className={cn(
                    "flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-xs transition-colors",
                    filters.isRotting
                        ? "border-amber/30 bg-amber/10 text-amber"
                        : "border-[var(--rim)] bg-surface-2 text-t2 hover:border-[var(--rim2)] hover:text-t1",
                )}
            >
                <Flame className="h-3 w-3" />
                Parados
                {filters.isRotting && (
                    <X
                        className="ml-0.5 h-3 w-3 opacity-60 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); set("isRotting", false); }}
                    />
                )}
            </button>

            {/* Agent toggle */}
            <button
                onClick={() => set("hasAgent", !filters.hasAgent)}
                className={cn(
                    "flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-xs transition-colors",
                    filters.hasAgent
                        ? "border-violet/30 bg-violet/10 text-violet"
                        : "border-[var(--rim)] bg-surface-2 text-t2 hover:border-[var(--rim2)] hover:text-t1",
                )}
            >
                <Bot className="h-3 w-3" />
                Com agente
                {filters.hasAgent && (
                    <X
                        className="ml-0.5 h-3 w-3 opacity-60 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); set("hasAgent", false); }}
                    />
                )}
            </button>

            {/* Tag filter */}
            <div className="min-w-[180px]">
                <TagAutocomplete
                    value={selectedTags}
                    options={tagOptions}
                    onChange={(next) => set("tagIds", next.map((t) => t.id))}
                    onSearchChange={setTagSearch}
                    placeholder="Filtrar por tags..."
                />
            </div>

            {/* Clear all */}
            {isAnyFilterActive && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs text-t3 hover:text-t1"
                    onClick={() => onFiltersChange({ ...DEFAULT_FILTERS, view: filters.view })}
                >
                    <X className="mr-1 h-3 w-3" />
                    Limpar filtros
                </Button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* View switcher */}
            <div className="flex overflow-hidden rounded-[8px] border border-[var(--rim)] bg-surface-2">
                {VIEWS.map((v) => (
                    <button
                        key={v.id}
                        onClick={() => set("view", v.id)}
                        title={v.label}
                        className={cn(
                            "flex h-8 items-center gap-1.5 px-3 text-xs transition-colors",
                            v.id === filters.view
                                ? "bg-surface-3 text-t1"
                                : "text-t3 hover:text-t2",
                        )}
                    >
                        {v.icon}
                        <span className="hidden sm:inline">{v.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

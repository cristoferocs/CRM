"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, Plus, Check } from "lucide-react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { TagChip } from "@/components/ui/tag-chip";
import { tagColor } from "@/lib/tag-color";
import { cn } from "@/lib/utils";

export interface TagOption {
    id: string;
    name: string;
    color: string;
}

export interface TagAutocompleteProps {
    value: TagOption[];
    options: TagOption[];
    onChange: (tags: TagOption[]) => void;
    /**
     * Called when the user wants to create a new tag from the typed query.
     * Resolves with the new tag (id, name, color) once it's persisted server-side.
     */
    onCreate?: (name: string) => Promise<TagOption>;
    /** Called whenever the search input changes — use to debounce remote lookups. */
    onSearchChange?: (query: string) => void;
    placeholder?: string;
    emptyMessage?: string;
    disabled?: boolean;
    loading?: boolean;
    /** Hard cap on number of selected tags. */
    maxTags?: number;
    /** Extra classes for the trigger button. Width should be set here. */
    className?: string;
    /** Fixed width (px) of the dropdown panel. Defaults to the trigger width. */
    contentWidth?: number;
}

// Estimated panel height used before the panel is measured, so the very first
// placement decision (above vs. below the trigger) is reasonable.
const ESTIMATED_PANEL_HEIGHT = 320;

interface PanelPosition {
    top: number;
    left: number;
    width: number;
}

/**
 * A multi-select tag combobox. The dropdown is rendered into `document.body`
 * via a portal with `position: fixed`, so it always floats above the rest of
 * the UI and never affects the layout of the element that hosts the trigger.
 */
export function TagAutocomplete({
    value,
    options,
    onChange,
    onCreate,
    onSearchChange,
    placeholder = "Selecione ou crie tags...",
    emptyMessage = "Nenhuma tag encontrada",
    disabled,
    loading,
    maxTags,
    className,
    contentWidth,
}: TagAutocompleteProps) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [creating, setCreating] = React.useState(false);
    const [mounted, setMounted] = React.useState(false);
    const [pos, setPos] = React.useState<PanelPosition>({ top: 0, left: 0, width: 260 });

    const triggerRef = React.useRef<HTMLButtonElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const searchRef = React.useRef<HTMLInputElement>(null);

    // Portals require the DOM — only enable after the first client render.
    React.useEffect(() => setMounted(true), []);

    const selectedIds = React.useMemo(() => new Set(value.map((t) => t.id)), [value]);
    const trimmed = query.trim();
    const hasExactMatch = trimmed
        ? options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase()) ||
          value.some((o) => o.name.toLowerCase() === trimmed.toLowerCase())
        : true;

    const canCreate =
        !!onCreate &&
        !!trimmed &&
        !hasExactMatch &&
        !creating &&
        (!maxTags || value.length < maxTags);

    // -- Positioning ---------------------------------------------------------

    const reposition = React.useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();
        const width = contentWidth ?? Math.max(rect.width, 240);
        const panelHeight = panelRef.current?.offsetHeight ?? ESTIMATED_PANEL_HEIGHT;

        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        // Flip above only when there isn't room below AND there's more room above.
        const placeAbove = spaceBelow < panelHeight + 12 && spaceAbove > spaceBelow;

        let left = rect.left;
        if (left + width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - 8 - width);
        }
        const top = placeAbove ? Math.max(8, rect.top - panelHeight - 4) : rect.bottom + 4;

        setPos({ top, left, width });
    }, [contentWidth]);

    // Recompute position whenever the panel opens, and keep it pinned to the
    // trigger on scroll/resize (capture phase catches scrolling containers).
    React.useLayoutEffect(() => {
        if (!open) return;
        reposition();
        const handler = () => reposition();
        window.addEventListener("scroll", handler, true);
        window.addEventListener("resize", handler);
        return () => {
            window.removeEventListener("scroll", handler, true);
            window.removeEventListener("resize", handler);
        };
    }, [open, reposition]);

    // -- Open / close behaviour ---------------------------------------------

    React.useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    // Focus the search field on open; clear the query on close.
    React.useEffect(() => {
        if (open) {
            const id = requestAnimationFrame(() => searchRef.current?.focus());
            return () => cancelAnimationFrame(id);
        }
        setQuery("");
        onSearchChange?.("");
        // onSearchChange is intentionally excluded to avoid re-running on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // -- Actions -------------------------------------------------------------

    const toggle = (tag: TagOption) => {
        if (selectedIds.has(tag.id)) {
            onChange(value.filter((t) => t.id !== tag.id));
        } else {
            if (maxTags && value.length >= maxTags) return;
            onChange([...value, tag]);
        }
    };

    const handleCreate = async () => {
        if (!onCreate || !trimmed) return;
        try {
            setCreating(true);
            const tag = await onCreate(trimmed);
            if (!selectedIds.has(tag.id)) onChange([...value, tag]);
            setQuery("");
            onSearchChange?.("");
        } finally {
            setCreating(false);
        }
    };

    const handleSearchChange = (next: string) => {
        setQuery(next);
        onSearchChange?.(next);
    };

    // -- Render --------------------------------------------------------------

    const filteredOptions = trimmed
        ? options.filter((o) => o.name.toLowerCase().includes(trimmed.toLowerCase()))
        : options;

    const panel = (
        <div
            ref={panelRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 60 }}
            className="overflow-hidden rounded-[12px] border border-rim bg-surface-2 text-t1 shadow-[0_12px_32px_rgba(0,0,0,0.55)] animate-in fade-in-0 zoom-in-95"
        >
            <Command shouldFilter={false}>
                <CommandInput
                    ref={searchRef}
                    value={query}
                    onValueChange={handleSearchChange}
                    placeholder="Buscar tag..."
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && canCreate) {
                            e.preventDefault();
                            void handleCreate();
                        }
                    }}
                />
                <CommandList>
                    <CommandEmpty>
                        {canCreate ? null : trimmed ? emptyMessage : "Comece a digitar..."}
                    </CommandEmpty>

                    {canCreate && (
                        <CommandGroup>
                            <CommandItem
                                onSelect={handleCreate}
                                className="flex items-center gap-2 text-violet"
                            >
                                {creating ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Plus className="h-3.5 w-3.5" />
                                )}
                                <span>
                                    Criar tag <span className="font-mono">&quot;{trimmed}&quot;</span>
                                </span>
                            </CommandItem>
                        </CommandGroup>
                    )}

                    {filteredOptions.length > 0 && (
                        <CommandGroup heading="Tags">
                            {filteredOptions.map((opt) => {
                                const selected = selectedIds.has(opt.id);
                                const { fg } = tagColor(opt.color);
                                return (
                                    <CommandItem
                                        key={opt.id}
                                        value={opt.name}
                                        onSelect={() => toggle(opt)}
                                    >
                                        <span
                                            className="h-2.5 w-2.5 rounded-full border border-rim"
                                            style={{ backgroundColor: fg }}
                                            aria-hidden
                                        />
                                        <span className="flex-1 truncate">{opt.name}</span>
                                        {selected && <Check className="h-3.5 w-3.5 text-t2" />}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    )}
                </CommandList>
            </Command>
        </div>
    );

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                disabled={disabled}
                data-state={open ? "open" : "closed"}
                onClick={() => {
                    if (disabled) return;
                    setOpen((prev) => !prev);
                }}
                className={cn(
                    "group inline-flex h-9 min-w-[160px] max-w-full items-center gap-1 rounded-[10px] border border-rim bg-surface-3 px-2 py-1 text-left text-[13px] transition-colors",
                    "hover:border-rim2 data-[state=open]:border-violet/40",
                    disabled && "cursor-not-allowed opacity-60",
                    className,
                )}
            >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 overflow-hidden">
                    {value.length === 0 ? (
                        <span className="truncate text-t3">{placeholder}</span>
                    ) : (
                        <>
                            {value.slice(0, 3).map((tag) => (
                                <TagChip key={tag.id} name={tag.name} color={tag.color} compact />
                            ))}
                            {value.length > 3 && (
                                <span className="font-mono text-[10px] text-t3">
                                    +{value.length - 3}
                                </span>
                            )}
                        </>
                    )}
                </div>
                {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-t3" />}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-t3 transition-transform group-data-[state=open]:rotate-180" />
            </button>

            {mounted && open && createPortal(panel, document.body)}
        </>
    );
}

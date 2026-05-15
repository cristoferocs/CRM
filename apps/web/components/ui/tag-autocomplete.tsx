"use client";

import * as React from "react";
import { ChevronDown, Loader2, Plus, Check } from "lucide-react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
    /** Width of the dropdown panel (defaults to matching trigger). */
    contentWidth?: number | string;
}

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
            if (!selectedIds.has(tag.id)) {
                onChange([...value, tag]);
            }
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

    // Reset the search when the popover closes so reopening starts fresh.
    React.useEffect(() => {
        if (!open) {
            setQuery("");
            onSearchChange?.("");
        }
        // onSearchChange is intentionally omitted — we only want to react to open changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const triggerLabel =
        value.length === 0 ? placeholder : `${value.length} tag${value.length === 1 ? "" : "s"}`;

    return (
        <Popover open={open && !disabled} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    aria-haspopup="listbox"
                    disabled={disabled}
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
                            value.slice(0, 3).map((tag) => (
                                <TagChip
                                    key={tag.id}
                                    name={tag.name}
                                    color={tag.color}
                                    compact
                                />
                            ))
                        )}
                        {value.length > 3 && (
                            <span className="font-mono text-[10px] text-t3">
                                +{value.length - 3}
                            </span>
                        )}
                    </div>
                    {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-t3" />}
                    <ChevronDown
                        className={cn(
                            "h-3.5 w-3.5 shrink-0 text-t3 transition-transform group-data-[state=open]:rotate-180",
                        )}
                    />
                    <span className="sr-only">{triggerLabel}</span>
                </button>
            </PopoverTrigger>

            <PopoverContent
                align="start"
                side="bottom"
                sideOffset={4}
                collisionPadding={8}
                className="p-0"
                style={
                    contentWidth
                        ? { width: typeof contentWidth === "number" ? `${contentWidth}px` : contentWidth }
                        : { width: "var(--radix-popover-trigger-width)", minWidth: 240 }
                }
                onOpenAutoFocus={(event) => {
                    // Let Radix focus the first focusable item (the CommandInput
                    // inside the popover) without our trigger fighting for focus.
                    event.preventDefault();
                    const input = (event.currentTarget as HTMLElement).querySelector<HTMLInputElement>(
                        "[cmdk-input]",
                    );
                    input?.focus();
                }}
            >
                <Command shouldFilter={false}>
                    <CommandInput
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
                        {options.length > 0 && (
                            <CommandGroup heading="Tags">
                                {options
                                    .filter(
                                        (opt) =>
                                            !trimmed ||
                                            opt.name.toLowerCase().includes(trimmed.toLowerCase()),
                                    )
                                    .map((opt) => {
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
                        {value.length > 0 && (
                            <CommandGroup heading="Selecionadas">
                                {value.map((tag) => (
                                    <CommandItem
                                        key={`sel-${tag.id}`}
                                        value={`__sel__${tag.name}`}
                                        onSelect={() => toggle(tag)}
                                        className="flex items-center justify-between gap-2"
                                    >
                                        <TagChip name={tag.name} color={tag.color} compact />
                                        <Check className="h-3.5 w-3.5 text-t2" />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

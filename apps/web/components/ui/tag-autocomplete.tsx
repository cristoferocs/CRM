"use client";

import * as React from "react";
import { Loader2, Plus, Check } from "lucide-react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
    /** If false, the trigger renders as filter chip (no inline input). */
    allowInput?: boolean;
    /** Hard cap on number of selected tags. */
    maxTags?: number;
    className?: string;
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
    allowInput = true,
    maxTags,
    className,
}: TagAutocompleteProps) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [creating, setCreating] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const selectedIds = React.useMemo(() => new Set(value.map((t) => t.id)), [value]);
    const trimmed = query.trim();
    const hasExactMatch = trimmed
        ? options.some((o) => o.name.toLowerCase() === trimmed.toLowerCase()) ||
          value.some((o) => o.name.toLowerCase() === trimmed.toLowerCase())
        : true;

    const canCreate = !!onCreate && !!trimmed && !hasExactMatch && !creating &&
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
            // Add only if it wasn't already chosen via a race condition.
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

    return (
        <Popover open={open && !disabled} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <div
                    role="combobox"
                    aria-expanded={open}
                    onClick={() => {
                        if (disabled) return;
                        setOpen(true);
                        requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    className={cn(
                        "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-[10px] border border-rim bg-surface-3 px-2 py-1 text-[13px] transition-colors",
                        "focus-within:border-violet/40",
                        disabled && "cursor-not-allowed opacity-60",
                        className,
                    )}
                >
                    {value.map((tag) => (
                        <TagChip
                            key={tag.id}
                            name={tag.name}
                            color={tag.color}
                            onRemove={disabled ? undefined : () => toggle(tag)}
                        />
                    ))}
                    {allowInput && (
                        <input
                            ref={inputRef}
                            value={query}
                            disabled={disabled}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            onFocus={() => setOpen(true)}
                            onKeyDown={(e) => {
                                if (e.key === "Backspace" && query === "" && value.length > 0) {
                                    e.preventDefault();
                                    onChange(value.slice(0, -1));
                                } else if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (canCreate) {
                                        void handleCreate();
                                    }
                                }
                            }}
                            placeholder={value.length === 0 ? placeholder : ""}
                            className="min-w-[80px] flex-1 bg-transparent text-t1 placeholder:text-t3 outline-none"
                            aria-label="Buscar tag"
                        />
                    )}
                    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-t3" />}
                </div>
            </PopoverAnchor>

            <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        value={query}
                        onValueChange={handleSearchChange}
                        placeholder="Buscar tags..."
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
                                    .filter((opt) =>
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
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagColor } from "@/lib/tag-color";

export interface TagChipProps extends React.HTMLAttributes<HTMLSpanElement> {
    name: string;
    color: string;
    /** When provided, renders an X button that fires onRemove. */
    onRemove?: () => void;
    /** Smaller variant for dense lists / kanban cards. */
    compact?: boolean;
}

export const TagChip = React.forwardRef<HTMLSpanElement, TagChipProps>(
    ({ name, color, onRemove, compact, className, ...props }, ref) => {
        const { bg, fg, border } = tagColor(color);
        return (
            <span
                ref={ref}
                style={{ backgroundColor: bg, color: fg, borderColor: border }}
                className={cn(
                    "inline-flex items-center gap-1 rounded-[20px] border font-mono transition-colors",
                    compact ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
                    className,
                )}
                {...props}
            >
                <span className="truncate max-w-[120px]">{name}</span>
                {onRemove && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full opacity-70 hover:opacity-100 focus:outline-none"
                        aria-label={`Remover ${name}`}
                    >
                        <X className="h-2.5 w-2.5" />
                    </button>
                )}
            </span>
        );
    },
);
TagChip.displayName = "TagChip";

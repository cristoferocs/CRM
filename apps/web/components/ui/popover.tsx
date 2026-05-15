"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

interface PopoverContentProps
    extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
    /** Optional portal container override — defaults to document.body. */
    container?: HTMLElement | null;
}

const PopoverContent = React.forwardRef<
    React.ElementRef<typeof PopoverPrimitive.Content>,
    PopoverContentProps
>(({ className, align = "start", sideOffset = 6, container, ...props }, ref) => (
    <PopoverPrimitive.Portal container={container ?? undefined}>
        <PopoverPrimitive.Content
            ref={ref}
            align={align}
            sideOffset={sideOffset}
            collisionPadding={8}
            className={cn(
                // z-index higher than the dashboard's sticky chrome (which uses z-40);
                // outline removed because the popover is its own focus surface.
                "z-50 rounded-[12px] border border-rim bg-surface-2 p-1 text-t1 shadow-[0_8px_24px_rgba(0,0,0,0.45)] outline-none",
                "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                className,
            )}
            {...props}
        />
    </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };

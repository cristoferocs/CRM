"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Lightweight popover built on a body portal + `position: fixed`.
 *
 * It deliberately does NOT depend on `@radix-ui/react-popover` — the panel is
 * rendered into `document.body` so it always floats above the page chrome and
 * can never push or distort the layout of the element hosting the trigger.
 *
 * API surface: <Popover>, <PopoverTrigger>, <PopoverContent>.
 */

interface PopoverContextValue {
    open: boolean;
    setOpen: (open: boolean) => void;
    triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

function usePopoverContext(component: string): PopoverContextValue {
    const ctx = React.useContext(PopoverContext);
    if (!ctx) throw new Error(`<${component}> must be used within <Popover>`);
    return ctx;
}

interface PopoverProps {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
}

function Popover({ children, open: controlledOpen, onOpenChange, defaultOpen = false }: PopoverProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : uncontrolledOpen;
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);

    const setOpen = React.useCallback(
        (next: boolean) => {
            if (!isControlled) setUncontrolledOpen(next);
            onOpenChange?.(next);
        },
        [isControlled, onOpenChange],
    );

    return (
        <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
            {children}
        </PopoverContext.Provider>
    );
}

const PopoverTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, type = "button", ...props }, forwardedRef) => {
    const { open, setOpen, triggerRef } = usePopoverContext("PopoverTrigger");
    return (
        <button
            {...props}
            type={type}
            ref={(node) => {
                triggerRef.current = node;
                if (typeof forwardedRef === "function") forwardedRef(node);
                else if (forwardedRef) forwardedRef.current = node;
            }}
            data-state={open ? "open" : "closed"}
            aria-expanded={open}
            onClick={(event) => {
                onClick?.(event);
                if (!event.defaultPrevented) setOpen(!open);
            }}
        />
    );
});
PopoverTrigger.displayName = "PopoverTrigger";

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
    align?: "start" | "center" | "end";
    sideOffset?: number;
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
    ({ className, align = "start", sideOffset = 6, style, ...props }, forwardedRef) => {
        const { open, setOpen, triggerRef } = usePopoverContext("PopoverContent");
        const [mounted, setMounted] = React.useState(false);
        const panelRef = React.useRef<HTMLDivElement | null>(null);
        const [pos, setPos] = React.useState({ top: 0, left: 0 });

        React.useEffect(() => setMounted(true), []);

        const reposition = React.useCallback(() => {
            const trigger = triggerRef.current;
            if (!trigger) return;
            const rect = trigger.getBoundingClientRect();
            const panelW = panelRef.current?.offsetWidth ?? 256;
            const panelH = panelRef.current?.offsetHeight ?? 240;

            let left =
                align === "end"
                    ? rect.right - panelW
                    : align === "center"
                        ? rect.left + rect.width / 2 - panelW / 2
                        : rect.left;
            left = Math.min(Math.max(8, left), window.innerWidth - panelW - 8);

            const spaceBelow = window.innerHeight - rect.bottom;
            const placeAbove = spaceBelow < panelH + sideOffset + 8 && rect.top > spaceBelow;
            const top = placeAbove
                ? Math.max(8, rect.top - panelH - sideOffset)
                : rect.bottom + sideOffset;

            setPos({ top, left });
        }, [align, sideOffset, triggerRef]);

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
        }, [open, setOpen, triggerRef]);

        if (!mounted || !open) return null;

        return createPortal(
            <div
                {...props}
                ref={(node) => {
                    panelRef.current = node;
                    if (typeof forwardedRef === "function") forwardedRef(node);
                    else if (forwardedRef) forwardedRef.current = node;
                }}
                data-state={open ? "open" : "closed"}
                style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 60, ...style }}
                className={cn(
                    "rounded-[12px] border border-rim bg-surface-2 p-1 text-t1 shadow-[0_12px_32px_rgba(0,0,0,0.55)] outline-none",
                    "animate-in fade-in-0 zoom-in-95",
                    className,
                )}
            />,
            document.body,
        );
    },
);
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent };

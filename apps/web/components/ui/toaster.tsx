"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
    return (
        <Sonner
            theme="dark"
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast:
                        "group toast bg-surface border border-rim text-t1 shadow-xl rounded-[10px] font-sans",
                    description: "text-t2",
                    actionButton: "bg-violet text-white",
                    cancelButton: "bg-surface-3 text-t2",
                    success: "!border-jade/20 [&>[data-icon]]:text-jade",
                    error: "!border-rose/20 [&>[data-icon]]:text-rose",
                    warning: "!border-amber/20 [&>[data-icon]]:text-amber",
                    info: "!border-cyan/20 [&>[data-icon]]:text-cyan",
                },
            }}
            richColors
            position="bottom-right"
        />
    );
}

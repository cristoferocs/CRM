import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-9 w-full rounded-[10px] border border-rim bg-surface-3 px-3 py-2 text-sm text-t1 placeholder:text-t3",
                    "transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium",
                    "focus-visible:outline-none focus-visible:border-violet/40 focus-visible:ring-0",
                    "hover:border-rim2",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "autofill:bg-surface-3",
                    className,
                )}
                ref={ref}
                {...props}
            />
        );
    },
);
Input.displayName = "Input";

export { Input };

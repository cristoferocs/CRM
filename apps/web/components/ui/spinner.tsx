import * as React from "react";
import { cn } from "@/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: "sm" | "md" | "lg";
}

const sizeMap = {
    sm: "h-4 w-4 border-[1.5px]",
    md: "h-6 w-6 border-2",
    lg: "h-8 w-8 border-2",
};

function Spinner({ className, size = "md", ...props }: SpinnerProps) {
    return (
        <div
            role="status"
            className={cn(
                "inline-block rounded-full border-t-transparent border-violet animate-spin",
                sizeMap[size],
                className,
            )}
            {...props}
        >
            <span className="sr-only">Loading...</span>
        </div>
    );
}

export { Spinner };

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
    "inline-flex items-center gap-1 rounded-[20px] px-2 py-0.5 text-xs font-mono border transition-colors",
    {
        variants: {
            variant: {
                default:
                    "bg-violet-dim text-violet border-violet/20",
                jade:
                    "bg-jade-dim text-jade border-jade/20",
                cyan:
                    "bg-cyan-dim text-cyan border-cyan/20",
                rose:
                    "bg-rose-dim text-rose border-rose/20",
                amber:
                    "bg-amber-dim text-amber border-amber/20",
                muted:
                    "bg-surface-3 text-t2 border-rim",
                outline:
                    "border-rim2 text-t2 bg-transparent",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    );
}

export { Badge, badgeVariants };

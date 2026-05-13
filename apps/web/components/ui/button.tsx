import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                default:
                    "bg-violet text-white shadow-[0_0_20px_rgba(124,92,252,0.3)] hover:bg-[#8d6dfd] hover:shadow-[0_0_28px_rgba(124,92,252,0.5)] hover:-translate-y-px",
                destructive:
                    "bg-rose-dim text-rose border border-rose/20 hover:bg-rose/20",
                outline:
                    "bg-surface-2 text-t2 border border-rim hover:bg-surface-3 hover:border-rim2 hover:text-t1",
                secondary:
                    "bg-surface-2 text-t2 border border-rim hover:bg-surface-3 hover:text-t1",
                ghost:
                    "text-t2 hover:bg-surface-2 hover:text-t1",
                cyan:
                    "bg-cyan-dim text-cyan border border-cyan/20 hover:bg-cyan/[0.18] hover:shadow-[0_0_16px_rgba(0,212,255,0.25)]",
                jade:
                    "bg-jade-dim text-jade border border-jade/20 hover:bg-jade/20",
                link: "text-violet underline-offset-4 hover:underline",
            },
            size: {
                default: "h-9 px-4 py-2",
                sm: "h-7 rounded-[6px] px-3 text-xs",
                lg: "h-11 rounded-[10px] px-6 text-base",
                icon: "h-8 w-8 p-0",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    },
);
Button.displayName = "Button";

export { Button, buttonVariants };

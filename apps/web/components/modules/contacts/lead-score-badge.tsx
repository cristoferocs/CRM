import { cn } from "@/lib/utils";

type Temperature = "COLD" | "WARM" | "HOT";

interface LeadScoreBadgeProps {
    score: number;
    temperature: Temperature;
    className?: string;
}

const TEMP_CONFIG: Record<Temperature, { label: string; bg: string; text: string; dot: string }> = {
    COLD: { label: "Frio", bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
    WARM: { label: "Morno", bg: "bg-yellow-500/10", text: "text-yellow-500", dot: "bg-yellow-400" },
    HOT: { label: "Quente", bg: "bg-red-500/10", text: "text-red-500", dot: "bg-red-400" },
};

export function LeadScoreBadge({ score, temperature, className }: LeadScoreBadgeProps) {
    const config = TEMP_CONFIG[temperature] ?? TEMP_CONFIG.COLD;
    return (
        <div className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            config.bg, config.text, className,
        )}>
            <div className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
            {score} · {config.label}
        </div>
    );
}

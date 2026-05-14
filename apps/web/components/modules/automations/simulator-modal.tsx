"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, Play, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSimulate, type SimulateInput, type SimulatorResult } from "@/hooks/useSimulator";

/**
 * Pre-flight simulation modal: replays the automation's trigger +
 * conditions against the org's recent history WITHOUT executing any
 * action. Lets the user verify a rule won't accidentally fire 300 times
 * before flipping isActive=true.
 *
 * The modal is intentionally non-blocking: it never persists, never
 * sends, never queues. Backend enforces the same — see
 * apps/api/src/modules/automations/simulator.service.ts.
 */
export function SimulatorModal({
    open,
    onOpenChange,
    input,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    input: SimulateInput | null;
}) {
    const [days, setDays] = useState(30);
    const simulate = useSimulate();

    useEffect(() => {
        if (open && input) {
            simulate.mutate({ ...input, days });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, days]);

    const result = simulate.data;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Play className="h-4 w-4" aria-hidden="true" />
                        Simulação — últimos {days}d
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-t3">Período:</span>
                        {[7, 14, 30, 60, 90].map((d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDays(d)}
                                className={cn(
                                    "rounded-md border px-2 py-1 transition-colors",
                                    days === d
                                        ? "border-violet/40 bg-violet-dim text-violet"
                                        : "border-[var(--rim)] text-t2 hover:bg-surface-2",
                                )}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>

                    {simulate.isPending && (
                        <div className="flex h-32 items-center justify-center gap-2 text-sm text-t3">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Replaying contra o histórico…
                        </div>
                    )}

                    {simulate.isError && (
                        <div className="rounded-md border border-rose/40 bg-rose-dim p-3 text-sm text-rose">
                            <strong className="block">Não foi possível simular</strong>
                            <span className="text-t2">{simulate.error.message}</span>
                        </div>
                    )}

                    {result && <SimulationResult result={result} />}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Fechar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SimulationResult({ result }: { result: SimulatorResult }) {
    const matchRate =
        result.eventCount > 0
            ? Math.round((result.wouldFire / result.eventCount) * 100)
            : 0;
    const maxBar = useMemo(
        () => Math.max(1, ...result.daily.map((d) => d.total)),
        [result.daily],
    );

    if (result.note) {
        return (
            <div className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber-dim p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 text-amber" aria-hidden="true" />
                <span className="text-t2">{result.note}</span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Headline numbers */}
            <div className="grid grid-cols-3 gap-3">
                <Stat
                    label="Eventos no período"
                    value={String(result.eventCount)}
                    sub={`${result.triggerType}`}
                />
                <Stat
                    label="Disparariam"
                    value={String(result.wouldFire)}
                    sub={`${matchRate}% dos eventos`}
                    accent={result.wouldFire > 0 ? "jade" : "t3"}
                />
                <Stat
                    label="Por dia (média)"
                    value={(result.wouldFire / Math.max(1, result.rangeDays)).toFixed(1)}
                    sub={result.truncated ? "amostragem truncada" : "amostra completa"}
                />
            </div>

            {/* Daily histogram */}
            {result.daily.length > 0 && (
                <div className="rounded-md border border-[var(--rim)] bg-surface-2 p-3">
                    <p className="mb-2 text-[11px] text-t3">
                        Histograma diário — barra sólida = passaria nas condições
                    </p>
                    <div className="flex h-16 items-end gap-px">
                        {result.daily.map((d) => (
                            <div
                                key={d.date}
                                title={`${d.date}: ${d.wouldFire} de ${d.total}`}
                                className="flex h-full flex-1 flex-col-reverse"
                                aria-label={`${d.date}: ${d.wouldFire} disparariam de ${d.total} eventos`}
                            >
                                <div
                                    className="bg-violet"
                                    style={{ height: `${(d.wouldFire / maxBar) * 100}%` }}
                                />
                                <div
                                    className="bg-surface-3"
                                    style={{
                                        height: `${((d.total - d.wouldFire) / maxBar) * 100}%`,
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Sample list */}
            {result.samples.length > 0 && (
                <div>
                    <p className="mb-2 text-[11px] uppercase tracking-wider text-t3">
                        Amostras
                    </p>
                    <ul className="max-h-56 space-y-1 overflow-y-auto pr-2">
                        {result.samples.map((s) => (
                            <li
                                key={s.entityId + s.occurredAt}
                                className="flex items-center gap-2 rounded-md border border-[var(--rim)] bg-surface-2 px-3 py-1.5 text-[12px]"
                            >
                                {s.matchedConditions ? (
                                    <CheckCircle2
                                        className="h-3.5 w-3.5 shrink-0 text-jade"
                                        aria-label="Passaria"
                                    />
                                ) : (
                                    <XCircle
                                        className="h-3.5 w-3.5 shrink-0 text-t4"
                                        aria-label="Bloqueado pelas condições"
                                    />
                                )}
                                <span className="truncate text-t1">{s.label}</span>
                                <span className="ml-auto font-mono text-[10px] text-t3">
                                    {new Date(s.occurredAt).toLocaleString("pt-BR", {
                                        day: "2-digit",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {result.eventCount === 0 && (
                <div className="rounded-md border border-[var(--rim)] bg-surface-2 p-3 text-sm text-t3">
                    Nenhum evento desse tipo no período. A automação não dispararia nada agora.
                </div>
            )}
        </div>
    );
}

function Stat({
    label,
    value,
    sub,
    accent,
}: {
    label: string;
    value: string;
    sub: string;
    accent?: "jade" | "t3";
}) {
    return (
        <div className="rounded-md border border-[var(--rim)] bg-surface-2 p-3">
            <p className="text-[10px] uppercase tracking-wider text-t3">{label}</p>
            <p
                className={cn(
                    "mt-1 font-display text-2xl font-semibold",
                    accent === "jade" ? "text-jade" : "text-t1",
                )}
            >
                {value}
            </p>
            <p className="mt-0.5 text-[10px] text-t3">{sub}</p>
        </div>
    );
}

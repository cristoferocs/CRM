"use client";

import { DollarSign, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

function usePayments() {
    return useQuery({
        queryKey: ["payments"],
        queryFn: async () => {
            const res = await api.get("/payments");
            const payments = (res.data.data ?? []).map((payment: any) => ({
                ...payment,
                status: payment.status?.toLowerCase(),
                dueDate: payment.dueDate ?? payment.dueAt,
            }));
            return { ...res.data, payments };
        },
    });
}

const STATUS_VARIANTS: Record<string, "jade" | "amber" | "rose" | "muted"> = {
    paid: "jade",
    pending: "amber",
    overdue: "rose",
    cancelled: "muted",
};

const STATUS_LABELS: Record<string, string> = {
    paid: "Pago",
    pending: "Pendente",
    overdue: "Vencido",
    cancelled: "Cancelado",
};

export default function PaymentsPage() {
    const { data, isLoading } = usePayments();

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                    Financeiro
                </h1>
                <p className="mt-1.5 text-sm text-t2">Cobranças e receita</p>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: "Receita do mês", value: "R$284k", icon: <DollarSign className="h-5 w-5 text-jade" />, color: "text-jade" },
                    { label: "A receber", value: "R$62k", icon: <Clock className="h-5 w-5 text-amber" />, color: "text-amber" },
                    { label: "Crescimento", value: "+31%", icon: <TrendingUp className="h-5 w-5 text-cyan" />, color: "text-cyan" },
                    { label: "Pagos hoje", value: "8", icon: <CheckCircle className="h-5 w-5 text-violet" />, color: "text-violet" },
                ].map((kpi) => (
                    <Card key={kpi.label}>
                        <CardContent className="pt-5">
                            <span className="block mb-2">{kpi.icon}</span>
                            <p className={cn("font-display text-2xl font-semibold", kpi.color)}>
                                {kpi.value}
                            </p>
                            <p className="mt-1 text-xs text-t2">{kpi.label}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Payments table */}
            <Card>
                <CardHeader>
                    <CardTitle>Transações</CardTitle>
                </CardHeader>
                <div className="border-t border-[var(--rim)]" />
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr>
                                {["Cliente", "Descrição", "Valor", "Vencimento", "Status"].map((h) => (
                                    <th
                                        key={h}
                                        className="border-b border-[var(--rim)] px-4 py-2.5 text-left font-mono text-[10px] uppercase tracking-widest text-t3 font-normal"
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading
                                ? Array.from({ length: 6 }).map((_, i) => (
                                    <tr key={i}>
                                        {Array.from({ length: 5 }).map((_, j) => (
                                            <td key={j} className="px-4 py-3">
                                                <Skeleton className="h-3 w-24" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                                : (data?.payments ?? []).map((payment: any) => (
                                    <tr
                                        key={payment.id}
                                        className="border-b border-[var(--rim)] last:border-none hover:bg-surface-2 transition-colors"
                                    >
                                        <td className="px-4 py-3 text-sm text-t1">
                                            {payment.contact?.name ?? "—"}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-t2">
                                            {payment.description ?? "—"}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-[13px] text-jade">
                                            {formatCurrency(payment.amount)}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-[11px] text-t3">
                                            {formatDate(payment.dueDate)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant={STATUS_VARIANTS[payment.status] ?? "muted"}>
                                                {STATUS_LABELS[payment.status] ?? payment.status}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

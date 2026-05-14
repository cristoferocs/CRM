"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    FileText, Upload, Send, Eye, Trash2, Clock,
    CheckCircle2, AlertCircle, FileSignature, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const STATUS_MAP: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
    DRAFT: { label: "Rascunho", icon: FileText, color: "text-t3" },
    SENT: { label: "Enviado", icon: Send, color: "text-blue-400" },
    VIEWED: { label: "Visualizado", icon: Eye, color: "text-yellow-400" },
    SIGNED: { label: "Assinado", icon: CheckCircle2, color: "text-green-500" },
    EXPIRED: { label: "Expirado", icon: AlertCircle, color: "text-red-400" },
    DECLINED: { label: "Recusado", icon: AlertCircle, color: "text-red-400" },
};

const DOC_TYPE_COLORS: Record<string, string> = {
    CONTRACT: "bg-violet/10 text-violet",
    PROPOSAL: "bg-blue-500/10 text-blue-400",
    NDA: "bg-yellow-500/10 text-yellow-500",
    INVOICE: "bg-green-500/10 text-green-500",
    ONBOARDING: "bg-orange-500/10 text-orange-400",
    OTHER: "bg-surface2 text-t3",
};

export default function DocumentsPage() {
    const qc = useQueryClient();
    const [search, setSearch] = useState("");

    const { data: docs = [], isLoading } = useQuery({
        queryKey: ["documents"],
        queryFn: () => api.get("/documents").then(r => r.data),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/documents/${id}`),
        onSuccess: () => { toast.success("Documento excluído."); qc.invalidateQueries({ queryKey: ["documents"] }); },
        onError: () => toast.error("Erro ao excluir documento."),
    });

    const sendForSignatureMutation = useMutation({
        mutationFn: (id: string) => api.post(`/documents/${id}/send-for-signature`),
        onSuccess: () => { toast.success("Enviado para assinatura!"); qc.invalidateQueries({ queryKey: ["documents"] }); },
        onError: () => toast.error("Erro ao enviar para assinatura."),
    });

    const filtered = docs.filter((d: { name: string; type: string }) =>
        d.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-t1">Documentos</h1>
                    <p className="text-sm text-t3">Gerencie contratos, propostas e assinaturas digitais</p>
                </div>
                <Button className="gap-2">
                    <Upload className="h-4 w-4" /> Novo Documento
                </Button>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t3" />
                <Input
                    placeholder="Buscar documentos..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                />
            </div>

            {/* Document list */}
            {isLoading ? (
                <div className="flex flex-col gap-3">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-20 animate-pulse rounded-xl bg-surface2" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rim)] py-20">
                    <FileText className="h-10 w-10 text-t3" />
                    <p className="text-t3">Nenhum documento encontrado</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map((doc: {
                        id: string; name: string; type: string; status: string;
                        signerEmail?: string; expiresAt?: string; createdAt: string;
                        contact?: { name: string }; deal?: { title: string };
                    }) => {
                        const statusInfo = (STATUS_MAP[doc.status] ?? STATUS_MAP.DRAFT)!;
                        const StatusIcon = statusInfo.icon;
                        return (
                            <Card key={doc.id} className="hover:border-violet/30 transition-colors">
                                <CardContent className="flex items-center gap-4 p-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface2">
                                        <FileText className="h-5 w-5 text-t2" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-t1 truncate">{doc.name}</p>
                                            <Badge className={cn("text-[10px] border-0 shrink-0", DOC_TYPE_COLORS[doc.type] ?? DOC_TYPE_COLORS.OTHER)}>
                                                {doc.type}
                                            </Badge>
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-3 text-xs text-t3">
                                            {doc.contact && <span>📇 {doc.contact.name}</span>}
                                            {doc.deal && <span>💼 {doc.deal.title}</span>}
                                            {doc.signerEmail && <span>✉️ {doc.signerEmail}</span>}
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={cn("flex items-center gap-1.5 text-xs font-medium", statusInfo.color)}>
                                        <StatusIcon className="h-3.5 w-3.5" />
                                        {statusInfo.label}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {doc.status === "DRAFT" && (
                                            <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                                                onClick={() => sendForSignatureMutation.mutate(doc.id)}
                                                disabled={sendForSignatureMutation.isPending}>
                                                <FileSignature className="h-3 w-3" /> Enviar para Assinar
                                            </Button>
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-t3 hover:text-red-400">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Esta ação não pode ser desfeita. O documento "{doc.name}" será removido permanentemente.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => deleteMutation.mutate(doc.id)} className="bg-red-500 hover:bg-red-600">
                                                        Excluir
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

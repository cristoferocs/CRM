"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, FileText, AlertCircle, Loader2, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SignDocumentPage() {
    const params = useParams<{ id: string }>();
    const searchParams = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const docId = params.id;
    const token = searchParams.get("token") ?? "";
    const router = useRouter();
    const [signerName, setSignerName] = useState("");
    const [agreed, setAgreed] = useState(false);
    const [signed, setSigned] = useState(false);

    const { data, isLoading, isError } = useQuery({
        queryKey: ["sign", docId, token],
        queryFn: () => api.get(`/documents/sign/${docId}?token=${token}`).then(r => r.data),
        enabled: !!token,
    });

    const signMutation = useMutation({
        mutationFn: () => api.post(`/documents/sign/${docId}?token=${token}`, { signerName }),
        onSuccess: () => setSigned(true),
    });

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <Loader2 className="h-8 w-8 animate-spin text-violet" />
            </div>
        );
    }

    if (isError || !data) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3 text-center">
                    <AlertCircle className="h-12 w-12 text-red-400" />
                    <h1 className="text-xl font-bold text-gray-800">Link inválido ou expirado</h1>
                    <p className="text-sm text-gray-500">Este link de assinatura não é válido ou já expirou.</p>
                </div>
            </div>
        );
    }

    if (signed || data.status === "SIGNED") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                        <CheckCircle2 className="h-10 w-10 text-green-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">Documento Assinado!</h1>
                    <p className="text-sm text-gray-500">
                        "{data.document?.title}" foi assinado com sucesso.
                        Uma cópia será enviada por e-mail.
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                        Assinado em: {new Date().toLocaleString("pt-BR")}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4">
            <div className="mx-auto max-w-2xl">
                {/* Header */}
                <div className="mb-8 flex flex-col items-center gap-3 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet/10">
                        <FileText className="h-7 w-7 text-violet" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Assinar Documento</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Você foi convidado para assinar o documento abaixo
                        </p>
                    </div>
                </div>

                {/* Document info */}
                <Card className="mb-6">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                                <FileText className="h-6 w-6 text-gray-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-lg font-semibold text-gray-800">{data.document?.title}</h2>
                                <div className="mt-1 flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">{data.document?.type}</Badge>
                                    <span className="text-xs text-gray-400">
                                        Expira em: {new Date(data.expiresAt).toLocaleDateString("pt-BR")}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Document content preview */}
                        {data.document?.content && (
                            <div className="mt-5 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                {data.document.content}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Signature form */}
                <Card>
                    <CardContent className="p-6">
                        <h3 className="mb-4 font-semibold text-gray-800 flex items-center gap-2">
                            <PenLine className="h-4 w-4 text-violet" /> Sua Assinatura
                        </h3>

                        <div className="flex flex-col gap-4">
                            <div>
                                <Label htmlFor="signerName" className="text-sm text-gray-600 mb-1.5">
                                    Seu nome completo
                                </Label>
                                <Input
                                    id="signerName"
                                    placeholder="Digite seu nome completo..."
                                    value={signerName}
                                    onChange={e => setSignerName(e.target.value)}
                                    className="text-base"
                                />
                            </div>

                            {/* Agreement */}
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={e => setAgreed(e.target.checked)}
                                    className="mt-1 h-4 w-4 rounded border-gray-300 accent-violet"
                                />
                                <span className="text-sm text-gray-600">
                                    Declaro que li e concordo com o conteúdo do documento acima e que esta assinatura
                                    eletrônica tem validade jurídica conforme a Lei 14.063/2020.
                                </span>
                            </label>

                            <Button
                                className={cn("w-full gap-2 h-12 text-base", !signerName.trim() || !agreed ? "opacity-50" : "")}
                                disabled={!signerName.trim() || !agreed || signMutation.isPending}
                                onClick={() => signMutation.mutate()}
                            >
                                {signMutation.isPending ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <PenLine className="h-5 w-5" />
                                )}
                                Assinar Documento
                            </Button>

                            {signMutation.isError && (
                                <p className="text-xs text-red-500 text-center">
                                    Erro ao processar assinatura. Tente novamente.
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <p className="mt-6 text-center text-xs text-gray-400">
                    Powered by CRM · Assinatura eletrônica segura
                </p>
            </div>
        </div>
    );
}

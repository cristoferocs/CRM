"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Plus, FileText, Database } from "lucide-react";

interface KnowledgeBase {
    id: string;
    name: string;
    description?: string;
    type: string;
    isActive: boolean;
    _count?: { documents: number };
}

export default function KnowledgePage() {
    const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get<KnowledgeBase[]>("/knowledge-bases")
            .then((r) => setKbs(r.data))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Bases de Conhecimento</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Documentos e FAQs que os agentes de IA usam para responder.
                    </p>
                </div>
                <Link href="/knowledge/new">
                    <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Nova Base
                    </Button>
                </Link>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-36 bg-muted animate-pulse rounded-xl" />
                    ))}
                </div>
            ) : kbs.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Nenhuma base criada</p>
                    <p className="text-sm">Crie uma base para indexar documentos.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {kbs.map((kb) => (
                        <Link key={kb.id} href={`/knowledge/${kb.id}`}>
                            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                                                <BookOpen className="w-5 h-5 text-primary" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base">{kb.name}</CardTitle>
                                                <CardDescription className="text-xs capitalize">{kb.type.toLowerCase()}</CardDescription>
                                            </div>
                                        </div>
                                        <Badge variant={kb.isActive ? "default" : "outline"} className="text-xs">
                                            {kb.isActive ? "Ativa" : "Inativa"}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {kb.description && (
                                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{kb.description}</p>
                                    )}
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <FileText className="w-3 h-3" />
                                        <span>{kb._count?.documents ?? 0} documentos</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

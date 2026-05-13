"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Search, Loader2, Trash2 } from "lucide-react";

interface KBDocument {
    id: string;
    title: string;
    type: string;
    status: string;
    createdAt: string;
}

interface SearchResult {
    id: string;
    content: string;
    score: number;
}

export default function KnowledgeDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [docs, setDocs] = useState<KBDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        api.get<KBDocument[]>(`/knowledge-bases/${id}/documents`)
            .then((r) => setDocs(r.data))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [id]);

    const runSearch = async () => {
        if (!searchQuery.trim()) return;
        setSearching(true);
        try {
            const res = await api.post<SearchResult[]>(`/knowledge-bases/${id}/search`, {
                query: searchQuery,
                limit: 5,
            });
            setSearchResults(res.data);
        } catch {
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    const deleteDoc = async (docId: string) => {
        await api.delete(`/knowledge-bases/${id}/documents/${docId}`);
        setDocs((prev) => prev.filter((d) => d.id !== docId));
    };

    return (
        <div className="p-6 space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
                <Link href="/knowledge">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold">Documentos</h1>
            </div>

            {/* Search */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Testar Busca Vetorial</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Digite uma pergunta para testar..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && void runSearch()}
                        />
                        <Button onClick={() => void runSearch()} disabled={searching}>
                            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </Button>
                    </div>
                    {searchResults.length > 0 && (
                        <div className="mt-4 space-y-3">
                            {searchResults.map((r) => (
                                <div key={r.id} className="bg-muted rounded-lg p-3 text-sm">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-medium text-xs text-muted-foreground">Score: {(r.score * 100).toFixed(1)}%</span>
                                    </div>
                                    <p className="line-clamp-4">{r.content}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Documents list */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Documentos Indexados</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-2">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                            ))}
                        </div>
                    ) : docs.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Nenhum documento indexado.</p>
                    ) : (
                        <div className="divide-y">
                            {docs.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between py-3">
                                    <div className="flex items-center gap-3">
                                        <FileText className="w-4 h-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm font-medium">{doc.title}</p>
                                            <p className="text-xs text-muted-foreground capitalize">{doc.type.toLowerCase()}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge
                                            variant="outline"
                                            className={
                                                doc.status === "INDEXED"
                                                    ? "border-green-500 text-green-600 text-xs"
                                                    : doc.status === "PROCESSING"
                                                        ? "border-yellow-500 text-yellow-600 text-xs"
                                                        : "text-xs"
                                            }
                                        >
                                            {doc.status}
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive"
                                            onClick={() => void deleteDoc(doc.id)}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

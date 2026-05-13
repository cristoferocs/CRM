"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Trash2, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Comment {
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; name: string; avatar?: string };
}

interface CommentThreadProps {
    entityType: string;
    entityId: string;
    currentUserId: string;
}

export function CommentThread({ entityType, entityId, currentUserId }: CommentThreadProps) {
    const qc = useQueryClient();
    const [content, setContent] = useState("");

    const { data: comments = [], isLoading } = useQuery({
        queryKey: ["comments", entityType, entityId],
        queryFn: () => api.get(`/collaboration/comments/${entityType}/${entityId}`).then(r => r.data),
    });

    const createMutation = useMutation({
        mutationFn: () => api.post("/collaboration/comments", { entityType, entityId, content }),
        onSuccess: () => {
            setContent("");
            qc.invalidateQueries({ queryKey: ["comments", entityType, entityId] });
        },
        onError: () => toast.error("Erro ao enviar comentário."),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/collaboration/comments/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", entityType, entityId] }),
        onError: () => toast.error("Erro ao excluir comentário."),
    });

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && content.trim()) {
            createMutation.mutate();
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-t2">
                <MessageSquare className="h-4 w-4" />
                Comentários {comments.length > 0 && <span className="text-t3">({comments.length})</span>}
            </div>

            {/* Comment list */}
            {isLoading ? (
                <div className="flex flex-col gap-2">
                    {[...Array(2)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-surface2" />)}
                </div>
            ) : comments.length === 0 ? (
                <p className="text-xs text-t3 text-center py-4">Nenhum comentário ainda. Seja o primeiro!</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {comments.map((comment: Comment) => (
                        <div key={comment.id} className="flex gap-3 group">
                            <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={comment.author.avatar} />
                                <AvatarFallback className="text-xs">{comment.author.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xs font-semibold text-t1">{comment.author.name}</span>
                                    <span className="text-[10px] text-t3">
                                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ptBR })}
                                    </span>
                                </div>
                                <p className="mt-0.5 text-sm text-t2 whitespace-pre-wrap">{comment.content}</p>
                            </div>
                            {comment.author.id === currentUserId && (
                                <button
                                    onClick={() => deleteMutation.mutate(comment.id)}
                                    className="invisible group-hover:visible text-t3 hover:text-red-400 transition-colors"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* New comment input */}
            <div className="flex gap-2">
                <Textarea
                    placeholder="Escreva um comentário... (use @nome para mencionar)"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="min-h-[60px] resize-none text-sm"
                />
                <Button
                    size="icon"
                    className="shrink-0 self-end"
                    disabled={!content.trim() || createMutation.isPending}
                    onClick={() => createMutation.mutate()}
                >
                    <Send className="h-4 w-4" />
                </Button>
            </div>
            <p className="text-[10px] text-t3">Ctrl+Enter para enviar</p>
        </div>
    );
}

"use client";

import { useState } from "react";
import { Plus, Search, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getInitials, cn } from "@/lib/utils";

function useUsers() {
    return useQuery({
        queryKey: ["users"],
        queryFn: async () => {
            const res = await api.get("/users");
            return res.data;
        },
    });
}

const ROLE_VARIANTS: Record<string, "default" | "cyan" | "jade" | "amber" | "rose"> = {
    SUPER_ADMIN: "rose",
    ADMIN: "violet" as any,
    MANAGER: "amber",
    AGENT: "jade",
};

const ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    MANAGER: "Gerente",
    AGENT: "Agente",
};

const AVATAR_COLORS = [
    "from-violet to-cyan",
    "from-cyan to-jade",
    "from-jade to-cyan",
    "from-rose to-amber",
    "from-amber to-violet",
];

export default function UsersSettingsPage() {
    const [search, setSearch] = useState("");
    const { data, isLoading } = useUsers();

    const users: any[] = (data?.users ?? []).filter((u: any) =>
        search
            ? u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
            : true,
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                        Usuários
                    </h1>
                    <p className="mt-1.5 text-sm text-t2">Gerencie membros da equipe</p>
                </div>
                <Button>
                    <Plus className="h-4 w-4" /> Convidar
                </Button>
            </div>

            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t3" />
                <Input
                    placeholder="Buscar usuário..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="space-y-2">
                {isLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <Card key={i}>
                            <CardContent className="py-3">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="space-y-1.5">
                                        <Skeleton className="h-3 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                    : users.map((user, i) => (
                        <Card key={user.id}>
                            <CardContent className="py-3">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10">
                                        <AvatarFallback
                                            className={cn(
                                                "bg-gradient-to-br text-sm",
                                                AVATAR_COLORS[i % AVATAR_COLORS.length],
                                            )}
                                        >
                                            {getInitials(user.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-t1">{user.name}</p>
                                        <p className="text-xs text-t2">{user.email}</p>
                                    </div>
                                    <Badge variant={ROLE_VARIANTS[user.role] ?? "muted"}>
                                        {ROLE_LABELS[user.role] ?? user.role}
                                    </Badge>
                                    <Button variant="ghost" size="icon">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
            </div>
        </div>
    );
}

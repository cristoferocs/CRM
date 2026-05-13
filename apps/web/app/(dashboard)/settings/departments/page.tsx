"use client";

import { useState } from "react";
import { Plus, Users, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

function useDepartments() {
    return useQuery({
        queryKey: ["departments"],
        queryFn: async () => {
            const res = await api.get("/departments");
            return res.data;
        },
    });
}

export default function DepartmentsSettingsPage() {
    const { data, isLoading } = useDepartments();

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                        Departamentos
                    </h1>
                    <p className="mt-1.5 text-sm text-t2">Organize times e filas de atendimento</p>
                </div>
                <Button>
                    <Plus className="h-4 w-4" /> Novo Departamento
                </Button>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {isLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i}>
                            <CardContent className="pt-5 space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-20" />
                            </CardContent>
                        </Card>
                    ))
                    : (data?.departments ?? []).map((dept: any) => (
                        <Card key={dept.id} className="cursor-pointer hover:border-[var(--rim2)] transition-colors">
                            <CardHeader>
                                <CardTitle>{dept.name}</CardTitle>
                                <Button variant="ghost" size="icon" className="ml-auto">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2 text-t2">
                                    <Users className="h-4 w-4" />
                                    <span className="text-sm">{dept._count?.members ?? 0} membros</span>
                                </div>
                                {dept.isDefault && (
                                    <Badge variant="jade" className="mt-2">Padrão</Badge>
                                )}
                            </CardContent>
                        </Card>
                    ))}

                {/* New dept card */}
                <button className="flex flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-[var(--rim)] p-8 text-t3 transition-colors hover:border-[var(--rim2)] hover:text-t2">
                    <Plus className="h-6 w-6" />
                    <span className="text-sm">Novo Departamento</span>
                </button>
            </div>
        </div>
    );
}

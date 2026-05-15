"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Users,
    Building2,
    Plug,
    Kanban,
    Bell,
    Palette,
    Shield,
    Tag as TagIcon,
    ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SETTINGS_NAV = [
    {
        group: "Equipe",
        items: [
            { href: "/settings/users", icon: Users, label: "Usuários", desc: "Gerencie membros da equipe" },
            { href: "/settings/departments", icon: Building2, label: "Departamentos", desc: "Organize times e filas" },
        ],
    },
    {
        group: "Produto",
        items: [
            { href: "/settings/pipeline", icon: Kanban, label: "Funis de Venda", desc: "Configure etapas e campos" },
            { href: "/settings/tags", icon: TagIcon, label: "Tags", desc: "Etiquetas para contatos e deals" },
            { href: "/settings/integrations", icon: Plug, label: "Integrações", desc: "WhatsApp, Instagram, APIs" },
        ],
    },
    {
        group: "Sistema",
        items: [
            { href: "/settings", icon: Palette, label: "Aparência", desc: "Tema e white-label" },
            { href: "/settings", icon: Bell, label: "Notificações", desc: "Alertas e preferências" },
            { href: "/settings", icon: Shield, label: "Segurança", desc: "Senha e 2FA" },
        ],
    },
];

export default function SettingsPage() {
    const pathname = usePathname();

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                    Configurações
                </h1>
                <p className="mt-1.5 text-sm text-t2">Gerencie sua conta e organização</p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-3xl">
                {SETTINGS_NAV.map((group) => (
                    <div key={group.group} className="space-y-2">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-t3">
                            {group.group}
                        </p>
                        {group.items.map((item) => {
                            const active = pathname === item.href && item.href !== "/settings";
                            return (
                                <Link
                                    key={item.href + item.label}
                                    href={item.href}
                                    className={cn(
                                        "flex cursor-pointer items-center gap-3 rounded-[12px] border border-[var(--rim)] bg-surface p-4 transition-all hover:border-[var(--rim2)] hover:bg-surface-2",
                                        active && "border-violet/30 bg-violet-dim",
                                    )}
                                >
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 border border-[var(--rim)]">
                                        <item.icon className="h-4 w-4 text-t2" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-t1">{item.label}</p>
                                        <p className="text-xs text-t2 truncate">{item.desc}</p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-t3 shrink-0" />
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

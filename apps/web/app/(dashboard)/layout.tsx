"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
    LayoutDashboard,
    Users,
    Kanban,
    MessageSquare,
    CreditCard,
    BarChart2,
    Settings,
    Bot,
    BookOpen,
    Lightbulb,
    Zap,
    Bell,
    Plus,
    Search,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Moon,
    Sun,
    Trophy,
    FileText,
    ShieldCheck,
} from "lucide-react";
import { useWhiteLabelStore } from "@/stores/white-label.store";
import { useUIStore } from "@/stores/ui.store";
import { useAuthStore } from "@/stores/auth.store";
import { Logo } from "@/components/ui/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const MAIN_NAV = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Pipeline", href: "/pipeline", icon: Kanban },
    {
        label: "Inbox",
        href: "/inbox",
        icon: MessageSquare,
        badgeKey: "inbox" as const,
    },
    { label: "Contatos", href: "/contacts", icon: Users },
    { label: "Pagamentos", href: "/payments", icon: CreditCard },
] as const;

const INTELLIGENCE_NAV = [
    {
        label: "Agentes IA",
        href: "/agents",
        icon: Bot,
        badgeKey: "agents" as const,
    },
    { label: "Base de Conhec.", href: "/knowledge", icon: BookOpen },
    { label: "Insights", href: "/insights", icon: Lightbulb },
    { label: "Automações", href: "/automations", icon: Zap },
] as const;

const ANALYSIS_NAV = [
    { label: "Relatórios", href: "/reports", icon: BarChart2 },
    { label: "Gamificação", href: "/gamification", icon: Trophy },
    { label: "Documentos", href: "/documents", icon: FileText },
    { label: "Configurações", href: "/settings", icon: Settings },
] as const;

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ collapsed }: { collapsed: boolean }) {
    const pathname = usePathname();

    const isActive = (href: string) =>
        href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(href + "/");

    return (
        <aside
            className={cn(
                "relative flex h-screen flex-col overflow-hidden border-r border-[var(--rim)] bg-deep transition-all duration-300",
                collapsed ? "w-[60px]" : "w-[220px]",
            )}
        >
            {/* Ambient glow */}
            <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(124,92,252,0.12)_0%,transparent_70%)]" />

            {/* Logo */}
            <div
                className={cn(
                    "flex items-center gap-2.5 border-b border-[var(--rim)] py-7",
                    collapsed ? "justify-center px-3" : "px-6",
                )}
            >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-cyan text-sm font-bold text-white shadow-[0_0_20px_rgba(124,92,252,0.4)]">
                    N
                </div>
                {!collapsed && (
                    <div>
                        <Logo size="sm" />
                        <div className="font-mono text-[10px] uppercase tracking-[1px] text-t3">
                            v3.0 · white-label
                        </div>
                    </div>
                )}
            </div>

            {/* Nav */}
            <nav className="flex flex-1 flex-col gap-0 overflow-y-auto py-5">
                <NavSection label="Principal" collapsed={collapsed}>
                    {MAIN_NAV.map((item) => (
                        <NavItem
                            key={item.href}
                            {...item}
                            active={isActive(item.href)}
                            collapsed={collapsed}
                        />
                    ))}
                </NavSection>

                <NavSection label="Inteligência" collapsed={collapsed}>
                    {INTELLIGENCE_NAV.map((item) => (
                        <NavItem
                            key={item.href}
                            {...item}
                            active={isActive(item.href)}
                            collapsed={collapsed}
                        />
                    ))}
                </NavSection>

                <NavSection label="Análise" collapsed={collapsed}>
                    {ANALYSIS_NAV.map((item) => (
                        <NavItem
                            key={item.href}
                            {...item}
                            active={isActive(item.href)}
                            collapsed={collapsed}
                        />
                    ))}
                </NavSection>
            </nav>

            {/* User card */}
            <UserCard collapsed={collapsed} />
        </aside>
    );
}

function NavSection({
    label,
    collapsed,
    children,
}: {
    label: string;
    collapsed: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className={cn("mb-1", collapsed ? "px-2" : "px-4")}>
            {!collapsed && (
                <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[1.5px] text-t3">
                    {label}
                </p>
            )}
            <div className="flex flex-col gap-px">{children}</div>
        </div>
    );
}

function NavItem({
    label,
    href,
    icon: Icon,
    active,
    collapsed,
}: {
    label: string;
    href: string;
    icon: React.ElementType;
    active: boolean;
    collapsed: boolean;
}) {
    return (
        <Link
            href={href}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
                "group relative flex items-center gap-2.5 rounded-[10px] border border-transparent px-2.5 py-[9px] text-sm transition-all duration-150",
                collapsed ? "justify-center" : "",
                active
                    ? "border-violet/20 bg-violet-dim text-t1"
                    : "text-t2 hover:border-[var(--rim)] hover:bg-surface-2 hover:text-t1",
            )}
        >
            {/* Active indicator */}
            {active && (
                <span
                    aria-hidden="true"
                    className="absolute -left-px top-[20%] h-[60%] w-0.5 rounded-r-sm bg-violet shadow-[0_0_8px_#7c5cfc]"
                />
            )}

            <Icon
                aria-hidden="true"
                className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    active ? "text-violet" : "text-t3 group-hover:text-t2",
                )}
            />
            {!collapsed && <span className="flex-1 font-normal">{label}</span>}
        </Link>
    );
}

function UserCard({ collapsed }: { collapsed: boolean }) {
    const user = useAuthStore((s) => s.user);
    const clearAuth = useAuthStore((s) => s.clearAuth);
    const { theme, setTheme, adminMode, toggleAdminMode } = useUIStore();

    const canUseAdminMode =
        user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

    return (
        <div className={cn("border-t border-[var(--rim)] p-4", collapsed && "p-2")}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`Menu do usuário${user?.name ? `, ${user.name}` : ""}`}
                        className={cn(
                            "flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-[var(--rim)] bg-surface-2 p-2.5 transition-colors hover:border-[var(--rim2)]",
                            collapsed && "justify-center",
                        )}
                    >
                        <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={user?.avatar ?? undefined} />
                            <AvatarFallback>
                                {user ? getInitials(user.name) : "U"}
                            </AvatarFallback>
                        </Avatar>
                        {!collapsed && (
                            <div className="min-w-0 text-left">
                                <p className="truncate text-xs font-medium text-t1">
                                    {user?.name ?? "Usuário"}
                                </p>
                                <p className="font-mono text-[10px] text-t3">
                                    {user?.role ?? "AGENT"}
                                </p>
                            </div>
                        )}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-52">
                    <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        {theme === "dark" ? (
                            <Sun className="h-4 w-4" />
                        ) : (
                            <Moon className="h-4 w-4" />
                        )}
                        Alternar tema
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href="/settings">
                            <Settings className="h-4 w-4" />
                            Configurações
                        </Link>
                    </DropdownMenuItem>
                    {canUseAdminMode && (
                        <DropdownMenuItem onClick={toggleAdminMode}>
                            <ShieldCheck
                                className={cn(
                                    "h-4 w-4",
                                    adminMode && "text-violet",
                                )}
                            />
                            {adminMode
                                ? "Sair do modo administrativo"
                                : "Entrar no modo administrativo"}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="text-rose focus:text-rose"
                        onClick={clearAuth}
                    >
                        <LogOut className="h-4 w-4" />
                        Sair
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

function Topbar({
    collapsed,
    onToggle,
}: {
    collapsed: boolean;
    onToggle: () => void;
}) {
    const pathname = usePathname();
    const platformName = useWhiteLabelStore((s) => s.settings.platformName);
    const { unreadCount } = useUIStore();

    const allNavItems = [...MAIN_NAV, ...INTELLIGENCE_NAV, ...ANALYSIS_NAV];
    const current = allNavItems.find(
        ({ href }) =>
            href === pathname ||
            (href !== "/" && pathname.startsWith(href + "/")),
    );

    return (
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--rim)] bg-void/80 px-7 backdrop-blur-md">
            {/* Collapse toggle */}
            <button
                type="button"
                onClick={onToggle}
                aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
                aria-expanded={!collapsed}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[var(--rim)] bg-surface-2 text-t3 transition-all hover:border-[var(--rim2)] hover:bg-surface-3 hover:text-t1"
            >
                {collapsed ? (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                ) : (
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                )}
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm text-t2">
                <span>{platformName}</span>
                <span className="text-t3">›</span>
                <strong className="font-medium text-t1">
                    {current?.label ?? "Dashboard"}
                </strong>
            </div>

            {/* Live indicator */}
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-jade before:block before:h-1.5 before:w-1.5 before:animate-blink before:rounded-full before:bg-jade before:shadow-[0_0_6px_#00e5a0]">
                ao vivo
            </span>

            <div className="flex-1" />

            {/* Search */}
            <div className="flex items-center gap-2 rounded-[10px] border border-[var(--rim)] bg-surface-2 px-3 py-1.5 transition-colors hover:border-[var(--rim2)] w-52">
                <Search className="h-3.5 w-3.5 text-t3 shrink-0" />
                <input
                    readOnly
                    placeholder="Buscar..."
                    className="w-full bg-transparent text-xs text-t1 placeholder:text-t3 outline-none cursor-pointer"
                />
                <kbd className="font-mono text-[10px] text-t3">⌘K</kbd>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label="Criar novo"
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[var(--rim)] bg-surface-2 text-t2 transition-all hover:border-[var(--rim2)] hover:bg-surface-3 hover:text-t1"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    aria-label={
                        unreadCount > 0
                            ? `Notificações, ${unreadCount} não lidas`
                            : "Notificações"
                    }
                    className="relative flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[var(--rim)] bg-surface-2 text-t2 transition-all hover:border-[var(--rim2)] hover:bg-surface-3 hover:text-t1"
                >
                    <Bell className="h-4 w-4" aria-hidden="true" />
                    {unreadCount > 0 && (
                        <span
                            aria-hidden="true"
                            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose shadow-[0_0_6px_#ff4d6d] border border-void"
                        />
                    )}
                </button>
            </div>
        </header>
    );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { sidebarOpen, toggleSidebar } = useUIStore();

    return (
        <div className="flex h-screen overflow-hidden bg-void">
            <Sidebar collapsed={!sidebarOpen} />
            <div className="flex flex-1 flex-col overflow-hidden">
                <Topbar
                    collapsed={!sidebarOpen}
                    onToggle={toggleSidebar}
                />
                <main
                    id="main-content"
                    tabIndex={-1}
                    className="flex-1 overflow-y-auto bg-void p-7 focus:outline-none"
                >
                    {children}
                </main>
            </div>
        </div>
    );
}

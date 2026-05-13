"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWhiteLabelStore } from "@/stores/white-label.store";
import { Logo } from "@/components/ui/logo";

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Contatos", href: "/dashboard/contacts" },
    { label: "Negócios", href: "/dashboard/deals" },
    { label: "Atendimentos", href: "/dashboard/inbox" },
    { label: "Marketing", href: "/dashboard/marketing" },
    { label: "Automações", href: "/dashboard/automations" },
    { label: "Relatórios", href: "/dashboard/reports" },
    { label: "Configurações", href: "/dashboard/settings" },
] as const;

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar() {
    const pathname = usePathname();

    return (
        <aside
            className="flex h-screen w-56 flex-shrink-0 flex-col gap-1 overflow-y-auto px-3 py-4"
            style={{ backgroundColor: "var(--color-primary)" }}
        >
            {/* Logo */}
            <div className="mb-6 px-2">
                <Logo size="sm" className="brightness-0 invert" />
            </div>

            {/* Navigation */}
            <nav className="flex flex-col gap-0.5">
                {NAV_ITEMS.map(({ label, href }) => {
                    const active = pathname === href || pathname.startsWith(href + "/");
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active
                                    ? "bg-white/20 text-white"
                                    : "text-white/70 hover:bg-white/10 hover:text-white"
                                }`}
                        >
                            {label}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header() {
    const pathname = usePathname();
    const platformName = useWhiteLabelStore((s) => s.settings.platformName);

    const pageLabel =
        NAV_ITEMS.find(({ href }) => pathname === href || pathname.startsWith(href + "/"))?.label ??
        "Dashboard";

    return (
        <header
            className="flex h-12 items-center justify-between border-b border-white/10 px-6"
            style={{ backgroundColor: "var(--color-primary)" }}
        >
            <span className="text-sm font-semibold text-white">
                {platformName} — {pageLabel}
            </span>

            <div className="flex items-center gap-3">
                {/* Placeholder avatar */}
                <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: "var(--color-accent)" }}
                >
                    U
                </div>
            </div>
        </header>
    );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const platformName = useWhiteLabelStore((s) => s.settings.platformName);

    // Update tab title when navigating (client-side)
    const pathname = usePathname();
    const pageLabel =
        NAV_ITEMS.find(({ href }) => pathname === href || pathname.startsWith(href + "/"))?.label ?? "";

    if (typeof document !== "undefined") {
        document.title = pageLabel ? `${platformName} — ${pageLabel}` : platformName;
    }

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto bg-slate-50 px-6 py-6">{children}</main>
            </div>
        </div>
    );
}

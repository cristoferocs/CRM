import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Format BRL currency */
export function formatCurrency(
    value: number,
    options?: { compact?: boolean },
): string {
    if (options?.compact && value >= 1000) {
        const compact = new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            notation: "compact",
            maximumFractionDigits: 1,
        }).format(value);
        return compact;
    }
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
    }).format(value);
}

/** Format date to locale string */
export function formatDate(
    date: string | Date,
    pattern = "dd/MM/yyyy",
): string {
    return format(new Date(date), pattern, { locale: ptBR });
}

/** Format relative time (e.g. "há 2 horas") */
export function formatRelative(date: string | Date): string {
    return formatDistanceToNow(new Date(date), {
        addSuffix: true,
        locale: ptBR,
    });
}

/** Get initials from a full name */
export function getInitials(name: string, maxChars = 2): string {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, maxChars)
        .map((n) => n[0]!.toUpperCase())
        .join("");
}

/** Truncate text */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trimEnd() + "…";
}

/** Sleep util for dev/testing */
export const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

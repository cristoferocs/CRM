import type { VariableBag } from "./types.js";

/**
 * Resolves a dotted path like `contact.name` or `prev.node_123.result`
 * against a variable bag of namespaces.
 */
export function resolvePath(bag: VariableBag, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = bag;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        if (typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

export function makeInterpolator(bag: VariableBag) {
    return (template: string): string => {
        if (typeof template !== "string") return template;
        return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
            const v = resolvePath(bag, key);
            if (v === undefined || v === null) return "";
            if (typeof v === "object") return JSON.stringify(v);
            return String(v);
        });
    };
}

export function buildVariableBag(args: {
    contact?: { name?: string | null; phone?: string | null; email?: string | null; customFields?: unknown } | null;
    deal?: { title?: string | null; value?: unknown; stage?: { name?: string | null } | null } | null;
    owner?: { name?: string | null; email?: string | null } | null;
    org?: { name?: string | null } | null;
    triggerData?: Record<string, unknown>;
    triggerType?: string;
    previousOutputs?: Map<string, unknown>;
}): VariableBag {
    const cf = (args.contact?.customFields ?? {}) as Record<string, unknown>;
    return {
        contact: {
            name: args.contact?.name ?? "",
            phone: args.contact?.phone ?? "",
            email: args.contact?.email ?? "",
            company: (cf.company as string) ?? "",
            ...cf,
        },
        deal: {
            title: args.deal?.title ?? "",
            value: args.deal?.value?.toString?.() ?? "",
            stage: args.deal?.stage?.name ?? "",
        },
        owner: {
            name: args.owner?.name ?? "",
            email: args.owner?.email ?? "",
        },
        org: {
            name: args.org?.name ?? "",
        },
        trigger: {
            type: args.triggerType ?? "",
            ...((args.triggerData ?? {}) as Record<string, unknown>),
        },
        prev: Object.fromEntries(args.previousOutputs ?? []),
        // Back-compat aliases used in pt-BR templates
        nome: args.contact?.name ?? "",
        empresa: (cf.company as string) ?? "",
        vendedor: args.owner?.name ?? "",
        data: new Date().toLocaleDateString("pt-BR"),
    };
}

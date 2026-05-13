"use client";

import { useAuthStore } from "@/stores/auth.store";
import { useCallback } from "react";

type Resource =
    | "contacts"
    | "pipeline"
    | "inbox"
    | "payments"
    | "reports"
    | "settings"
    | "users"
    | "departments"
    | "automations"
    | "marketing";

type Action = "read" | "create" | "update" | "delete" | "manage";

// Role-based permission matrix
const ROLE_PERMISSIONS: Record<string, Record<string, Action[]>> = {
    SUPER_ADMIN: {
        "*": ["read", "create", "update", "delete", "manage"],
    },
    ADMIN: {
        contacts: ["read", "create", "update", "delete"],
        pipeline: ["read", "create", "update", "delete"],
        inbox: ["read", "create", "update", "delete"],
        payments: ["read", "create", "update", "delete"],
        reports: ["read"],
        settings: ["read", "update", "manage"],
        users: ["read", "create", "update", "delete"],
        departments: ["read", "create", "update", "delete"],
        automations: ["read", "create", "update", "delete"],
        marketing: ["read", "create", "update", "delete"],
    },
    MANAGER: {
        contacts: ["read", "create", "update"],
        pipeline: ["read", "create", "update"],
        inbox: ["read", "create", "update"],
        payments: ["read"],
        reports: ["read"],
        settings: ["read"],
        users: ["read"],
        departments: ["read"],
        automations: ["read", "create", "update"],
        marketing: ["read", "create", "update"],
    },
    AGENT: {
        contacts: ["read", "create", "update"],
        pipeline: ["read", "update"],
        inbox: ["read", "create", "update"],
        payments: ["read"],
        reports: ["read"],
        settings: ["read"],
        users: [],
        departments: ["read"],
        automations: ["read"],
        marketing: ["read"],
    },
};

export function usePermissions() {
    const user = useAuthStore((s) => s.user);
    const role = user?.role ?? "AGENT";

    const can = useCallback(
        (resource: Resource, action: Action): boolean => {
            const rolePerms = ROLE_PERMISSIONS[role];
            if (!rolePerms) return false;

            // Wildcard (super admin)
            if (rolePerms["*"]?.includes(action) || rolePerms["*"]?.includes("manage")) {
                return true;
            }

            const resourcePerms = rolePerms[resource] ?? [];
            return resourcePerms.includes(action) || resourcePerms.includes("manage" as Action);
        },
        [role],
    );

    return { can, role };
}

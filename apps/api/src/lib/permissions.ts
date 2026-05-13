import type { FastifyReply, FastifyRequest } from "fastify";

export type AppRole = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "BRANCH_MANAGER" | "SELLER" | "SUPPORT" | "VIEWER";

export type Resource =
    | "organizations"
    | "users"
    | "departments"
    | "contacts"
    | "deals"
    | "pipeline"
    | "inbox"
    | "payments"
    | "marketing"
    | "automations"
    | "reports";

export type Action = "create" | "read" | "update" | "delete" | "manage";

const ROLE_LEVEL: Record<AppRole, number> = {
    SUPER_ADMIN: 100,
    ADMIN: 80,
    MANAGER: 60,
    BRANCH_MANAGER: 55,
    SELLER: 40,
    SUPPORT: 30,
    VIEWER: 10,
};

export function hasMinimumRole(userRole: string, minimum: AppRole): boolean {
    const level = ROLE_LEVEL[userRole as AppRole] ?? 0;
    return level >= ROLE_LEVEL[minimum];
}

export function checkPermission(
    userRole: string,
    resource: Resource,
    action: Action,
): boolean {
    const role = userRole as AppRole;

    switch (role) {
        case "SUPER_ADMIN":
            return true;

        case "ADMIN":
            return true;

        case "MANAGER":
            if (action === "read") return true;
            return ["contacts", "deals", "pipeline", "inbox", "departments"].includes(resource);

        case "SELLER":
            if (["contacts", "deals", "pipeline"].includes(resource)) {
                return ["read", "create", "update"].includes(action);
            }
            if (resource === "inbox") return ["read", "create", "update"].includes(action);
            return false;

        case "SUPPORT":
            return resource === "inbox";

        case "VIEWER":
            return resource === "reports" && action === "read";

        default:
            return false;
    }
}

/**
 * Fastify preHandler factory that gates a route behind a minimum role requirement.
 * Place after verifyJWT in the onRequest/preHandler chain.
 */
export function requireRole(minimum: AppRole) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const user = request.user;
        if (!user?.role || !hasMinimumRole(user.role, minimum)) {
            reply.code(403).send({ message: "Insufficient permissions" });
        }
    };
}

/**
 * Returns a preHandler that verifies the authenticated user belongs to the
 * requested organisation (extracted from params.id or params.orgId).
 * SUPER_ADMIN bypasses this check.
 */
export function requireSameOrg(paramKey = "id") {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const user = request.user;
        if (user?.role === "SUPER_ADMIN") return;

        const params = request.params as Record<string, string>;
        const targetOrgId = params[paramKey];

        if (targetOrgId && targetOrgId !== user?.orgId) {
            reply.code(403).send({ message: "Access denied to this organisation" });
        }
    };
}

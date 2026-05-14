import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdmin } from "../lib/firebase.js";
import { isJtiRevoked, isUserFamilyRevokedSince } from "../lib/jwt-revocation.js";

type PermissionAction = "create" | "read" | "update" | "delete" | "manage" | string;

interface AuthenticatedUser {
    id?: string;
    email?: string;
    orgId?: string;
    role?: string;
    type?: string;
    permissions?: string[];
    jti?: string;
    iat?: number;
}

export const ACCESS_COOKIE = "crm_access_token";
export const REFRESH_COOKIE = "crm_refresh_token";

declare module "fastify" {
    interface FastifyInstance {
        verifyFirebaseToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        verifyJWT: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        hasPermission: (resource: string, action: PermissionAction) => preHandlerHookHandler;
    }

    interface FastifyRequest {
        firebaseUser?: import("firebase-admin/auth").DecodedIdToken;
    }
}

declare module "@fastify/jwt" {
    interface FastifyJWT {
        user: AuthenticatedUser;
        payload: AuthenticatedUser;
    }
}

export const authPlugin = fp(async (fastify) => {
    const firebase = getFirebaseAdmin();
    const firebaseAuth = getAuth(firebase);

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error(
            "JWT_SECRET environment variable is required and must be at least 32 characters long."
        );
    }

    const cookieSecret = process.env.COOKIE_SECRET ?? jwtSecret;
    if (cookieSecret.length < 32) {
        throw new Error(
            "COOKIE_SECRET (or JWT_SECRET fallback) must be at least 32 characters long."
        );
    }

    await fastify.register(fastifyCookie, { secret: cookieSecret });
    await fastify.register(fastifyJwt, {
        secret: jwtSecret,
        // Look for the access token in the HttpOnly cookie first; fall back to
        // the Authorization: Bearer header so server-to-server / mobile / API
        // clients that can't carry cookies still work.
        cookie: { cookieName: ACCESS_COOKIE, signed: false },
    });

    fastify.decorate("verifyFirebaseToken", async (request: FastifyRequest, reply: FastifyReply) => {
        const token = readBearerToken(request);

        if (!token) {
            return reply.code(401).send({ message: "Missing bearer token" });
        }

        try {
            request.firebaseUser = await firebaseAuth.verifyIdToken(token);
        } catch (error) {
            request.log.warn({ error }, "invalid firebase token");
            return reply.code(401).send({ message: "Invalid Firebase token" });
        }
    });

    fastify.decorate("verifyJWT", async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // @fastify/jwt reads from cookie first (configured above) then from
            // Authorization: Bearer. Either source ends up on request.user.
            await request.jwtVerify<AuthenticatedUser>();

            const user = request.user;

            // Reject access tokens whose jti has been explicitly revoked
            // (e.g. logout, refresh rotation) — looked up in Redis.
            if (user.jti && (await isJtiRevoked(user.jti))) {
                request.log.warn({ jti: user.jti }, "revoked jti presented");
                return reply.code(401).send({ message: "Token revoked" });
            }

            // Reject tokens issued before the user's whole family was revoked
            // (used when refresh-token reuse is detected — see auth routes).
            if (user.id && user.iat && (await isUserFamilyRevokedSince(user.id, user.iat))) {
                request.log.warn({ userId: user.id, iat: user.iat }, "user family revoked");
                return reply.code(401).send({ message: "Session revoked" });
            }
        } catch (error) {
            request.log.warn({ error }, "invalid jwt token");
            return reply.code(401).send({ message: "Invalid JWT token" });
        }
    });

    fastify.decorate("hasPermission", (resource: string, action: PermissionAction) => {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            const user = request.user;
            const permissions = user?.permissions ?? [];
            const expectedPermission = `${resource}:${action}`;

            if (user?.role === "admin" || permissions.includes(expectedPermission) || permissions.includes(`${resource}:manage`)) {
                return;
            }

            return reply.code(403).send({ message: "Insufficient permissions" });
        };
    });
});

function readBearerToken(request: FastifyRequest) {
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        return null;
    }

    return authorization.slice("Bearer ".length);
}
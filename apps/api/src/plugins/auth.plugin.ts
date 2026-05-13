import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdmin } from "../lib/firebase.js";

type PermissionAction = "create" | "read" | "update" | "delete" | "manage" | string;

interface AuthenticatedUser {
    id?: string;
    email?: string;
    orgId?: string;
    role?: string;
    type?: string;
    permissions?: string[];
}

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

    await fastify.register(fastifyJwt, {
        secret: jwtSecret
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
            await request.jwtVerify<AuthenticatedUser>();
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
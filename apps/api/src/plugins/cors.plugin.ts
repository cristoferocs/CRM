import cors from "@fastify/cors";
import fp from "fastify-plugin";

function parseOrigins(): string[] {
    const candidates = [
        process.env.CORS_ORIGINS,
        process.env.APP_URL,
        process.env.WEB_URL,
    ];
    const set = new Set<string>();
    for (const c of candidates) {
        if (!c) continue;
        for (const piece of c.split(",")) {
            const trimmed = piece.trim();
            if (trimmed) set.add(trimmed);
        }
    }
    return Array.from(set);
}

export const corsPlugin = fp(async (fastify) => {
    const origins = parseOrigins();
    const allowAnyInDev =
        process.env.NODE_ENV !== "production" && origins.length === 0;

    if (origins.length === 0 && !allowAnyInDev) {
        throw new Error(
            "CORS misconfigured: set CORS_ORIGINS (comma-separated) or APP_URL in production.",
        );
    }

    if (allowAnyInDev) {
        fastify.log.warn(
            "CORS: no origin allowlist configured — allowing any origin (DEV only). Set CORS_ORIGINS or APP_URL.",
        );
    }

    await fastify.register(cors, {
        origin: (origin, cb) => {
            // Same-origin requests (server-to-server, curl, healthchecks) have no Origin header.
            if (!origin) return cb(null, true);
            if (allowAnyInDev) return cb(null, true);
            if (origins.includes(origin)) return cb(null, true);
            return cb(new Error(`Origin ${origin} not allowed`), false);
        },
        credentials: true,
    });
});

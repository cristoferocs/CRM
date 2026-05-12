import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";

export const rateLimitPlugin = fp(async (fastify) => {
    await fastify.register(rateLimit, {
        max: Number(process.env.RATE_LIMIT_MAX ?? 100),
        timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute"
    });
});
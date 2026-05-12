import type { FastifyPluginAsync } from "fastify";
import { AuthService } from "./module.service.js";
import { authHealthResponseSchema } from "./module.schema.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
    const authService = new AuthService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: authHealthResponseSchema
                }
            }
        },
        async () => authService.health()
    );
};
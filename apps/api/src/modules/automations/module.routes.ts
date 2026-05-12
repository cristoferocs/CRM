import type { FastifyPluginAsync } from "fastify";
import { AutomationsService } from "./module.service.js";
import { automationsHealthResponseSchema } from "./module.schema.js";

export const automationsRoutes: FastifyPluginAsync = async (fastify) => {
    const automationsService = new AutomationsService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: automationsHealthResponseSchema
                }
            }
        },
        async () => automationsService.health()
    );
};
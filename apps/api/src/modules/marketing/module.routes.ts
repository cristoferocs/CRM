import type { FastifyPluginAsync } from "fastify";
import { MarketingService } from "./module.service.js";
import { marketingHealthResponseSchema } from "./module.schema.js";

export const marketingRoutes: FastifyPluginAsync = async (fastify) => {
    const marketingService = new MarketingService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: marketingHealthResponseSchema
                }
            }
        },
        async () => marketingService.health()
    );
};
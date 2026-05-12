import type { FastifyPluginAsync } from "fastify";
import { PaymentsService } from "./module.service.js";
import { paymentsHealthResponseSchema } from "./module.schema.js";

export const paymentsRoutes: FastifyPluginAsync = async (fastify) => {
    const paymentsService = new PaymentsService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: paymentsHealthResponseSchema
                }
            }
        },
        async () => paymentsService.health()
    );
};
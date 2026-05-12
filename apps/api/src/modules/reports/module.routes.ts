import type { FastifyPluginAsync } from "fastify";
import { ReportsService } from "./module.service.js";
import { reportsHealthResponseSchema } from "./module.schema.js";

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
    const reportsService = new ReportsService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: reportsHealthResponseSchema
                }
            }
        },
        async () => reportsService.health()
    );
};
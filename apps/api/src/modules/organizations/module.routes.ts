import type { FastifyPluginAsync } from "fastify";
import { OrganizationsService } from "./module.service.js";
import { organizationsHealthResponseSchema } from "./module.schema.js";

export const organizationsRoutes: FastifyPluginAsync = async (fastify) => {
    const organizationsService = new OrganizationsService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: organizationsHealthResponseSchema
                }
            }
        },
        async () => organizationsService.health()
    );
};
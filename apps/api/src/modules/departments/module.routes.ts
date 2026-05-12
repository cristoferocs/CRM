import type { FastifyPluginAsync } from "fastify";
import { DepartmentsService } from "./module.service.js";
import { departmentsHealthResponseSchema } from "./module.schema.js";

export const departmentsRoutes: FastifyPluginAsync = async (fastify) => {
    const departmentsService = new DepartmentsService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: departmentsHealthResponseSchema
                }
            }
        },
        async () => departmentsService.health()
    );
};
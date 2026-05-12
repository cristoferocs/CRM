import type { FastifyPluginAsync } from "fastify";
import { UsersService } from "./module.service.js";
import { usersHealthResponseSchema } from "./module.schema.js";

export const usersRoutes: FastifyPluginAsync = async (fastify) => {
    const usersService = new UsersService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: usersHealthResponseSchema
                }
            }
        },
        async () => usersService.health()
    );
};
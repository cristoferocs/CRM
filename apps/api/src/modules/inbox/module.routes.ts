import type { FastifyPluginAsync } from "fastify";
import { InboxService } from "./module.service.js";
import { inboxHealthResponseSchema } from "./module.schema.js";

export const inboxRoutes: FastifyPluginAsync = async (fastify) => {
    const inboxService = new InboxService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: inboxHealthResponseSchema
                }
            }
        },
        async () => inboxService.health()
    );
};
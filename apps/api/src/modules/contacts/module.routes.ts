import type { FastifyPluginAsync } from "fastify";
import { ContactsService } from "./module.service.js";
import { contactsHealthResponseSchema } from "./module.schema.js";

export const contactsRoutes: FastifyPluginAsync = async (fastify) => {
    const contactsService = new ContactsService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: contactsHealthResponseSchema
                }
            }
        },
        async () => contactsService.health()
    );
};
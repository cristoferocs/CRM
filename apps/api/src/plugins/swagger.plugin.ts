import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "@fastify/type-provider-zod";
import fp from "fastify-plugin";

export const swaggerPlugin = fp(async (fastify) => {
    await fastify.register(swagger, {
        openapi: {
            info: {
                title: "CRM Base API",
                version: "0.1.0"
            }
        },
        transform: jsonSchemaTransform
    });

    await fastify.register(swaggerUi, {
        routePrefix: "/docs"
    });
});
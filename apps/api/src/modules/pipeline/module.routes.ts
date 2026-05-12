import type { FastifyPluginAsync } from "fastify";
import { PipelineService } from "./module.service.js";
import { pipelineHealthResponseSchema } from "./module.schema.js";

export const pipelineRoutes: FastifyPluginAsync = async (fastify) => {
    const pipelineService = new PipelineService();

    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: pipelineHealthResponseSchema
                }
            }
        },
        async () => pipelineService.health()
    );
};
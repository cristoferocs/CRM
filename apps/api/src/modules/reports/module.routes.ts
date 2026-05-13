import type { FastifyPluginAsync } from "fastify";
import { ReportsService } from "./module.service.js";
import { dashboardQuerySchema, dashboardResponseSchema, reportsHealthResponseSchema, type DashboardRange } from "./module.schema.js";

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
    const reportsService = new ReportsService();

    fastify.get(
        "/dashboard",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                querystring: dashboardQuerySchema,
                response: {
                    200: dashboardResponseSchema,
                },
            },
        },
        async (request) => {
            const { range } = request.query as { range: DashboardRange };
            return reportsService.dashboard(request.user.orgId!, range);
        },
    );

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
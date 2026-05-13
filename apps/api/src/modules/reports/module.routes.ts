import type { FastifyPluginAsync } from "fastify";
import { ReportsService } from "./module.service.js";
import { dashboardQuerySchema, dashboardResponseSchema, reportsHealthResponseSchema, type DashboardRange } from "./module.schema.js";
import { ReportsExtendedService } from "./reports-extended.service.js";

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
    const reportsService = new ReportsService();
    const ext = new ReportsExtendedService();

    fastify.get("/health", { schema: { response: { 200: reportsHealthResponseSchema } } },
        async () => reportsService.health());

    fastify.get("/dashboard", {
        onRequest: [fastify.verifyJWT],
        schema: { querystring: dashboardQuerySchema, response: { 200: dashboardResponseSchema } },
    }, async (req) => {
        const { range } = req.query as { range: DashboardRange };
        return reportsService.dashboard(req.user.orgId!, range);
    });

    fastify.get("/funnel", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { pipelineId, range } = req.query as Record<string, string>;
        return ext.funnel(req.user.orgId!, { pipelineId, range });
    });

    fastify.get("/forecast", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { months } = req.query as Record<string, string>;
        return ext.forecast(req.user.orgId!, Number(months ?? 3));
    });

    fastify.get("/team", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { range } = req.query as Record<string, string>;
        return ext.team(req.user.orgId!, range ?? "30d");
    });

    fastify.get("/pipeline-health", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { pipelineId } = req.query as Record<string, string>;
        return ext.pipelineHealth(req.user.orgId!, pipelineId);
    });

    fastify.get("/channels", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { range } = req.query as Record<string, string>;
        return ext.channels(req.user.orgId!, range ?? "30d");
    });

    fastify.get("/ai-agents", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { range } = req.query as Record<string, string>;
        return ext.aiAgents(req.user.orgId!, range ?? "30d");
    });

    fastify.get("/client-roi", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { contactId } = req.query as Record<string, string>;
        return ext.clientROI(req.user.orgId!, contactId);
    });

    fastify.post("/custom", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const body = req.body as Parameters<typeof ext.custom>[1];
        return ext.custom(req.user.orgId!, body);
    });

    fastify.get("/:type/export", { onRequest: [fastify.verifyJWT] }, async (req, reply) => {
        const { type } = req.params as { type: string };
        const { range, format } = req.query as Record<string, string>;
        const data = await ext.export(req.user.orgId!, type, range ?? "30d");
        if (format === "csv") {
            reply.header("Content-Type", "text/csv");
            reply.header("Content-Disposition", `attachment; filename="${type}-report.csv"`);
            return data.csv;
        }
        return data.json;
    });
};

import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { OrganizationsService } from "./module.service.js";
import {
    CreateOrganizationSchema,
    UpdateOrganizationSchema,
    OrganizationSettingsSchema,
    OrganizationResponseSchema,
    type CreateOrganizationInput,
    type UpdateOrganizationInput,
    type OrganizationSettingsInput,
} from "./module.schema.js";
import { branchesRoutes } from "./branches.routes.js";
import { whiteLabelRoutes } from "./white-label.routes.js";
import { requireRole, requireSameOrg } from "../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });
const SettingsResponseSchema = z.object({ settings: z.any() });

export const organizationsRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new OrganizationsService();

    // POST /organizations  (SUPER_ADMIN only — tenant provisioning)
    fastify.post(
        "/",
        {
            onRequest: [fastify.verifyJWT, requireRole("SUPER_ADMIN")],
            schema: {
                body: CreateOrganizationSchema,
                response: { 201: OrganizationResponseSchema },
            },
        },
        async (request, reply) => {
            const org = await service.create(request.body as CreateOrganizationInput);
            return reply.code(201).send(org);
        },
    );

    // GET /organizations/:id
    fastify.get(
        "/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg()],
            schema: {
                params: IdParams,
                response: { 200: OrganizationResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.findById(id);
        },
    );

    // PATCH /organizations/:id
    fastify.patch(
        "/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg()],
            schema: {
                params: IdParams,
                body: UpdateOrganizationSchema,
                response: { 200: OrganizationResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.update(id, request.body as UpdateOrganizationInput);
        },
    );

    // GET /organizations/:id/settings
    fastify.get(
        "/:id/settings",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg()],
            schema: {
                params: IdParams,
                response: { 200: SettingsResponseSchema },
            },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const settings = await service.getSettings(id);
            return reply.send({ settings });
        },
    );

    // PATCH /organizations/:id/settings
    fastify.patch(
        "/:id/settings",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg()],
            schema: {
                params: IdParams,
                body: OrganizationSettingsSchema,
                response: { 200: SettingsResponseSchema },
            },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const settings = await service.updateSettings(id, request.body as OrganizationSettingsInput);
            return reply.send({ settings });
        },
    );

    // Branch sub-routes: /organizations/:orgId/branches/...
    await fastify.register(branchesRoutes);

    // White-label sub-routes: /organizations/:orgId/white-label/...
    await fastify.register(whiteLabelRoutes);
};
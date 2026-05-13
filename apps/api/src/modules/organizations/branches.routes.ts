import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { BranchesService } from "./branches.service.js";
import {
    CreateBranchSchema,
    UpdateBranchSchema,
    BranchResponseSchema,
    BranchWithStatsSchema,
    BranchListResponseSchema,
    type CreateBranchInput,
    type UpdateBranchInput,
} from "./branches.schema.js";
import { requireRole, requireSameOrg } from "../../lib/permissions.js";

const OrgIdParams = z.object({ orgId: z.string() });
const BranchParams = z.object({ orgId: z.string(), id: z.string() });
const BranchUserParams = z.object({ orgId: z.string(), id: z.string(), userId: z.string() });

export async function branchesRoutes(fastify: FastifyInstance) {
    const service = new BranchesService();

    // GET /organizations/:orgId/branches
    fastify.get(
        "/:orgId/branches",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg("orgId")],
            schema: {
                params: OrgIdParams,
                response: { 200: BranchListResponseSchema },
            },
        },
        async (request) => {
            const { orgId } = request.params as { orgId: string };
            const data = await service.list(orgId);
            return { data, total: data.length };
        },
    );

    // GET /organizations/:orgId/branches/:id
    fastify.get(
        "/:orgId/branches/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER"), requireSameOrg("orgId")],
            schema: {
                params: BranchParams,
                response: { 200: BranchWithStatsSchema },
            },
        },
        async (request) => {
            const { orgId, id } = request.params as { orgId: string; id: string };
            return service.findByIdWithStats(id, orgId);
        },
    );

    // POST /organizations/:orgId/branches
    fastify.post(
        "/:orgId/branches",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg("orgId")],
            schema: {
                params: OrgIdParams,
                body: CreateBranchSchema,
                response: { 201: BranchResponseSchema },
            },
        },
        async (request, reply) => {
            const { orgId } = request.params as { orgId: string };
            const branch = await service.create(request.body as CreateBranchInput, orgId);
            return reply.code(201).send(branch);
        },
    );

    // PATCH /organizations/:orgId/branches/:id
    fastify.patch(
        "/:orgId/branches/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg("orgId")],
            schema: {
                params: BranchParams,
                body: UpdateBranchSchema,
                response: { 200: BranchResponseSchema },
            },
        },
        async (request) => {
            const { orgId, id } = request.params as { orgId: string; id: string };
            return service.update(id, request.body as UpdateBranchInput, orgId);
        },
    );

    // DELETE /organizations/:orgId/branches/:id  (soft deactivate)
    fastify.delete(
        "/:orgId/branches/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg("orgId")],
            schema: {
                params: BranchParams,
                response: { 200: z.object({ message: z.string() }) },
            },
        },
        async (request, reply) => {
            const { orgId, id } = request.params as { orgId: string; id: string };
            await service.deactivate(id, orgId);
            return reply.send({ message: "Branch deactivated" });
        },
    );

    // PATCH /organizations/:orgId/branches/:id/users/:userId
    fastify.patch(
        "/:orgId/branches/:id/users/:userId",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg("orgId")],
            schema: {
                params: BranchUserParams,
                response: { 200: z.object({ message: z.string() }) },
            },
        },
        async (request, reply) => {
            const { orgId, id, userId } = request.params as {
                orgId: string;
                id: string;
                userId: string;
            };
            await service.assignUser(userId, id, orgId);
            return reply.send({ message: "User assigned to branch" });
        },
    );
}

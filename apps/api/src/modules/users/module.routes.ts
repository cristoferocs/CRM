import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { UsersService } from "./module.service.js";
import {
    InviteUserSchema,
    UpdateUserSchema,
    UpdateRoleSchema,
    UserListQuerySchema,
    UserListResponseSchema,
    UserResponseSchema,
    type InviteUserInput,
    type UpdateUserInput,
    type UpdateRoleInput,
    type UserListQuery,
} from "./module.schema.js";
import { requireRole } from "../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });

export const usersRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new UsersService();

    // GET /users
    fastify.get(
        "/",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: {
                querystring: UserListQuerySchema,
                response: { 200: UserListResponseSchema },
            },
        },
        async (request) => {
            const orgId = request.user.orgId!;
            return service.list(orgId, request.query as UserListQuery);
        },
    );

    // GET /users/:id
    fastify.get(
        "/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                params: IdParams,
                response: { 200: UserResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            const isSelf = request.user.id === id;
            const isManagerPlus =
                request.user.role === "MANAGER" ||
                request.user.role === "ADMIN" ||
                request.user.role === "SUPER_ADMIN";

            if (!isSelf && !isManagerPlus) {
                throw Object.assign(new Error("Insufficient permissions"), { statusCode: 403 });
            }

            return service.findById(id, orgId);
        },
    );

    // POST /users/invite
    fastify.post(
        "/invite",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: {
                body: InviteUserSchema,
                response: { 201: UserResponseSchema },
            },
        },
        async (request, reply) => {
            const orgId = request.user.orgId!;
            const user = await service.invite(request.body as InviteUserInput, orgId);
            return reply.code(201).send(user);
        },
    );

    // PATCH /users/:id
    fastify.patch(
        "/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                params: IdParams,
                body: UpdateUserSchema,
                response: { 200: UserResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            const isSelf = request.user.id === id;
            const isAdminPlus =
                request.user.role === "ADMIN" || request.user.role === "SUPER_ADMIN";

            if (!isSelf && !isAdminPlus) {
                throw Object.assign(new Error("Insufficient permissions"), { statusCode: 403 });
            }

            return service.update(id, request.body as UpdateUserInput, orgId);
        },
    );

    // PATCH /users/:id/role
    fastify.patch(
        "/:id/role",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: {
                params: IdParams,
                body: UpdateRoleSchema,
                response: { 200: z.object({ message: z.string() }) },
            },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            const { role } = request.body as UpdateRoleInput;
            await service.updateRole(id, role, orgId);
            return reply.send({ message: "Role updated" });
        },
    );

    // DELETE /users/:id  (soft delete)
    fastify.delete(
        "/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: {
                params: IdParams,
                response: { 200: z.object({ message: z.string() }) },
            },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            await service.deactivate(id, orgId);
            return reply.send({ message: "User deactivated" });
        },
    );
};
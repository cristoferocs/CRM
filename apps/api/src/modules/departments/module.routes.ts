import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { DepartmentsService } from "./module.service.js";
import {
    CreateDepartmentSchema,
    UpdateDepartmentSchema,
    AssignUserSchema,
    DepartmentResponseSchema,
    DepartmentListResponseSchema,
    type CreateDepartmentInput,
    type UpdateDepartmentInput,
    type AssignUserInput,
} from "./module.schema.js";
import { requireRole } from "../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });
const IdAndUserParams = z.object({ id: z.string(), userId: z.string() });

export const departmentsRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new DepartmentsService();

    // GET /departments
    fastify.get(
        "/",
        {
            onRequest: [fastify.verifyJWT],
            schema: { response: { 200: DepartmentListResponseSchema } },
        },
        async (request) => {
            const orgId = request.user.orgId!;
            const data = await service.list(orgId);
            return { data, total: data.length };
        },
    );

    // GET /departments/:id
    fastify.get(
        "/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                params: IdParams,
                response: { 200: DepartmentResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.findById(id, request.user.orgId!);
        },
    );

    // POST /departments
    fastify.post(
        "/",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: {
                body: CreateDepartmentSchema,
                response: { 201: DepartmentResponseSchema },
            },
        },
        async (request, reply) => {
            const dept = await service.create(
                request.body as CreateDepartmentInput,
                request.user.orgId!,
            );
            return reply.code(201).send(dept);
        },
    );

    // PATCH /departments/:id
    fastify.patch(
        "/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: {
                params: IdParams,
                body: UpdateDepartmentSchema,
                response: { 200: DepartmentResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.update(id, request.body as UpdateDepartmentInput, request.user.orgId!);
        },
    );

    // DELETE /departments/:id
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
            await service.delete(id, request.user.orgId!);
            return reply.send({ message: "Department deleted" });
        },
    );

    // POST /departments/:id/users  — assign a user to the department
    fastify.post(
        "/:id/users",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: {
                params: IdParams,
                body: AssignUserSchema,
                response: { 200: z.object({ message: z.string() }) },
            },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const { userId } = request.body as AssignUserInput;
            await service.assignUser(id, userId, request.user.orgId!);
            return reply.send({ message: "User assigned to department" });
        },
    );

    // DELETE /departments/:id/users/:userId  — remove a user from the department
    fastify.delete(
        "/:id/users/:userId",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: {
                params: IdAndUserParams,
                response: { 200: z.object({ message: z.string() }) },
            },
        },
        async (request, reply) => {
            const { id, userId } = request.params as { id: string; userId: string };
            await service.removeUser(id, userId, request.user.orgId!);
            return reply.send({ message: "User removed from department" });
        },
    );
};
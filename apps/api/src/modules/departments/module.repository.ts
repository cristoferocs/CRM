import { prisma } from "../../lib/prisma.js";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "./module.schema.js";

export class DepartmentsRepository {
    list(orgId: string) {
        return prisma.department.findMany({
            where: { orgId },
            orderBy: { name: "asc" },
            include: { _count: { select: { users: true } } },
        });
    }

    findById(id: string, orgId: string) {
        return prisma.department.findFirst({
            where: { id, orgId },
            include: { _count: { select: { users: true } } },
        });
    }

    create(data: CreateDepartmentInput & { orgId: string }) {
        return prisma.department.create({
            data,
            include: { _count: { select: { users: true } } },
        });
    }

    update(id: string, orgId: string, data: UpdateDepartmentInput) {
        return prisma.department.updateMany({
            where: { id, orgId },
            data,
        });
    }

    delete(id: string, orgId: string) {
        return prisma.department.deleteMany({
            where: { id, orgId },
        });
    }

    assignUser(userId: string, departmentId: string, orgId: string) {
        return prisma.user.updateMany({
            where: { id: userId, orgId },
            data: { departmentId },
        });
    }

    removeUser(userId: string, departmentId: string, orgId: string) {
        return prisma.user.updateMany({
            where: { id: userId, orgId, departmentId },
            data: { departmentId: null },
        });
    }
}
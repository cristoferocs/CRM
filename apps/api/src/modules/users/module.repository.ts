import { prisma } from "../../lib/prisma.js";
import type { UserListQuery } from "./module.schema.js";

const withDepartment = {
    department: { select: { id: true, name: true } },
} as const;

export class UsersRepository {
    async list(orgId: string, filters: UserListQuery) {
        const { page, limit, role, departmentId, search, isActive } = filters;
        const skip = (page - 1) * limit;

        const where = {
            orgId,
            ...(role !== undefined ? { role } : {}),
            ...(departmentId !== undefined ? { departmentId } : {}),
            ...(isActive !== undefined ? { isActive } : {}),
            ...(search
                ? {
                    OR: [
                        { name: { contains: search, mode: "insensitive" as const } },
                        { email: { contains: search, mode: "insensitive" as const } },
                    ],
                }
                : {}),
        };

        const [data, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limit,
                include: withDepartment,
                orderBy: { name: "asc" },
            }),
            prisma.user.count({ where }),
        ]);

        return { data, total };
    }

    findById(id: string, orgId: string) {
        return prisma.user.findFirst({
            where: { id, orgId },
            include: withDepartment,
        });
    }

    create(data: {
        firebaseUid: string;
        email: string;
        name: string;
        role: string;
        orgId: string;
        departmentId?: string;
    }) {
        return prisma.user.create({
            data: {
                firebaseUid: data.firebaseUid,
                email: data.email,
                name: data.name,
                role: data.role as never,
                orgId: data.orgId,
                ...(data.departmentId ? { departmentId: data.departmentId } : {}),
            },
            include: withDepartment,
        });
    }

    update(
        id: string,
        orgId: string,
        data: Partial<{ name: string; avatar: string | null; departmentId: string | null }>,
    ) {
        return prisma.user.updateMany({
            where: { id, orgId },
            data,
        });
    }

    deactivate(id: string, orgId: string) {
        return prisma.user.updateMany({
            where: { id, orgId },
            data: { isActive: false },
        });
    }

    updateRole(id: string, orgId: string, role: string) {
        return prisma.user.updateMany({
            where: { id, orgId },
            data: { role: role as never },
        });
    }
}
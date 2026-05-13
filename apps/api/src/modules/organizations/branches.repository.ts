import { prisma } from "../../lib/prisma.js";
import type { CreateBranchInput, UpdateBranchInput } from "./branches.schema.js";

export class BranchesRepository {
    list(orgId: string) {
        return prisma.branch.findMany({
            where: { orgId },
            orderBy: [{ isHeadquarter: "desc" }, { name: "asc" }],
        });
    }

    findById(id: string, orgId: string) {
        return prisma.branch.findFirst({
            where: { id, orgId },
        });
    }

    findByCode(code: string, orgId: string) {
        return prisma.branch.findUnique({
            where: { orgId_code: { orgId, code } },
        });
    }

    create(data: CreateBranchInput & { orgId: string }) {
        return prisma.branch.create({ data });
    }

    update(id: string, orgId: string, data: UpdateBranchInput) {
        return prisma.branch.updateMany({
            where: { id, orgId },
            data,
        });
    }

    deactivate(id: string, orgId: string) {
        return prisma.branch.updateMany({
            where: { id, orgId },
            data: { isActive: false },
        });
    }

    countActiveBranches(orgId: string) {
        return prisma.branch.count({ where: { orgId, isActive: true } });
    }

    getUserCount(branchId: string) {
        return prisma.user.count({ where: { branchId, isActive: true } });
    }

    getStats(branchId: string) {
        return Promise.all([
            prisma.user.count({ where: { branchId, isActive: true } }),
            prisma.contact.count({ where: { branchId, isActive: true } }),
            prisma.deal.count({ where: { branchId, isActive: true } }),
            prisma.conversation.count({ where: { branchId, status: { in: ["OPEN", "PENDING", "BOT"] } } }),
        ]).then(([userCount, contactCount, dealCount, openConversations]) => ({
            userCount,
            contactCount,
            dealCount,
            openConversations,
        }));
    }

    assignUser(userId: string, branchId: string, orgId: string) {
        return prisma.user.updateMany({
            where: { id: userId, orgId },
            data: { branchId },
        });
    }

    removeUserFromBranch(userId: string, orgId: string) {
        return prisma.user.updateMany({
            where: { id: userId, orgId },
            data: { branchId: null },
        });
    }
}

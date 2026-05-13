import { BranchesRepository } from "./branches.repository.js";
import type { CreateBranchInput, UpdateBranchInput } from "./branches.schema.js";

export class BranchesService {
    constructor(private readonly repo = new BranchesRepository()) { }

    async list(orgId: string) {
        const branches = await this.repo.list(orgId);
        const withCounts = await Promise.all(
            branches.map(async (branch) => ({
                ...branch,
                userCount: await this.repo.getUserCount(branch.id),
            })),
        );
        return withCounts;
    }

    async findById(id: string, orgId: string) {
        const branch = await this.repo.findById(id, orgId);
        if (!branch) {
            throw Object.assign(new Error("Branch not found"), { statusCode: 404 });
        }
        return branch;
    }

    async findByIdWithStats(id: string, orgId: string) {
        const branch = await this.findById(id, orgId);
        const stats = await this.repo.getStats(branch.id);
        return { ...branch, stats };
    }

    async create(data: CreateBranchInput, orgId: string) {
        if (data.code) {
            const existing = await this.repo.findByCode(data.code, orgId);
            if (existing) {
                throw Object.assign(
                    new Error(`Branch code "${data.code}" is already in use in this organisation`),
                    { statusCode: 409 },
                );
            }
        }
        return this.repo.create({ ...data, orgId });
    }

    async update(id: string, data: UpdateBranchInput, orgId: string) {
        await this.findById(id, orgId);

        if (data.code) {
            const existing = await this.repo.findByCode(data.code, orgId);
            if (existing && existing.id !== id) {
                throw Object.assign(
                    new Error(`Branch code "${data.code}" is already in use in this organisation`),
                    { statusCode: 409 },
                );
            }
        }

        await this.repo.update(id, orgId, data);
        return this.findById(id, orgId);
    }

    async deactivate(id: string, orgId: string) {
        await this.findById(id, orgId);

        const activeCount = await this.repo.countActiveBranches(orgId);
        if (activeCount <= 1) {
            throw Object.assign(
                new Error("Cannot deactivate the only active branch of this organisation"),
                { statusCode: 422 },
            );
        }

        return this.repo.deactivate(id, orgId);
    }

    async assignUser(userId: string, branchId: string, orgId: string) {
        await this.findById(branchId, orgId);
        return this.repo.assignUser(userId, branchId, orgId);
    }

    async removeUserFromBranch(userId: string, orgId: string) {
        return this.repo.removeUserFromBranch(userId, orgId);
    }
}

import { DepartmentsRepository } from "./module.repository.js";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "./module.schema.js";

export class DepartmentsService {
    constructor(private readonly repo = new DepartmentsRepository()) { }

    list(orgId: string) {
        return this.repo.list(orgId);
    }

    async findById(id: string, orgId: string) {
        const dept = await this.repo.findById(id, orgId);
        if (!dept) {
            throw Object.assign(new Error("Department not found"), { statusCode: 404 });
        }
        return dept;
    }

    create(data: CreateDepartmentInput, orgId: string) {
        return this.repo.create({ ...data, orgId });
    }

    async update(id: string, data: UpdateDepartmentInput, orgId: string) {
        await this.findById(id, orgId);
        await this.repo.update(id, orgId, data);
        return this.findById(id, orgId);
    }

    async delete(id: string, orgId: string) {
        await this.findById(id, orgId);
        return this.repo.delete(id, orgId);
    }

    async assignUser(departmentId: string, userId: string, orgId: string) {
        await this.findById(departmentId, orgId);
        return this.repo.assignUser(userId, departmentId, orgId);
    }

    async removeUser(departmentId: string, userId: string, orgId: string) {
        await this.findById(departmentId, orgId);
        return this.repo.removeUser(userId, departmentId, orgId);
    }
}
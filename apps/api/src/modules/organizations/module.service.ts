import { OrganizationsRepository } from "./module.repository.js";
import { ensureDefaultSuperAdmin } from "../../lib/default-admin.js";
import type {
    CreateOrganizationInput,
    UpdateOrganizationInput,
    OrganizationSettingsInput,
} from "./module.schema.js";

export class OrganizationsService {
    constructor(private readonly repo = new OrganizationsRepository()) { }

    async create(data: CreateOrganizationInput) {
        const org = await this.repo.create(data);
        await this.repo.createDefaultPipeline(org.id);
        await ensureDefaultSuperAdmin(org.id);
        return org;
    }

    async findById(id: string) {
        const org = await this.repo.findById(id);
        if (!org) {
            throw Object.assign(new Error("Organization not found"), { statusCode: 404 });
        }
        return org;
    }

    async update(id: string, data: UpdateOrganizationInput) {
        await this.findById(id);
        return this.repo.update(id, data);
    }

    async getSettings(orgId: string) {
        const row = await this.repo.findSettings(orgId);
        if (!row) {
            throw Object.assign(new Error("Organization not found"), { statusCode: 404 });
        }
        return row.settings;
    }

    async updateSettings(orgId: string, settings: OrganizationSettingsInput) {
        const row = await this.repo.updateSettings(orgId, settings);
        return row.settings;
    }
}
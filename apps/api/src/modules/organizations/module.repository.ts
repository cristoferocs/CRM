import type { OrganizationsHealthResponse } from "./module.schema.js";

export class OrganizationsRepository {
    async health(): Promise<OrganizationsHealthResponse> {
        return {
            module: "organizations",
            status: "ok"
        };
    }
}
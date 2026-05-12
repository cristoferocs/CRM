import { OrganizationsRepository } from "./module.repository.js";
import type { OrganizationsHealthResponse } from "./module.schema.js";

export class OrganizationsService {
    constructor(private readonly organizationsRepository = new OrganizationsRepository()) { }

    health(): Promise<OrganizationsHealthResponse> {
        return this.organizationsRepository.health();
    }
}
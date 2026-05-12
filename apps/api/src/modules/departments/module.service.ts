import { DepartmentsRepository } from "./module.repository.js";
import type { DepartmentsHealthResponse } from "./module.schema.js";

export class DepartmentsService {
    constructor(private readonly departmentsRepository = new DepartmentsRepository()) { }

    health(): Promise<DepartmentsHealthResponse> {
        return this.departmentsRepository.health();
    }
}
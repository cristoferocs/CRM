import type { DepartmentsHealthResponse } from "./module.schema.js";

export class DepartmentsRepository {
    async health(): Promise<DepartmentsHealthResponse> {
        return {
            module: "departments",
            status: "ok"
        };
    }
}
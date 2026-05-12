import type { ReportsHealthResponse } from "./module.schema.js";

export class ReportsRepository {
    async health(): Promise<ReportsHealthResponse> {
        return {
            module: "reports",
            status: "ok"
        };
    }
}
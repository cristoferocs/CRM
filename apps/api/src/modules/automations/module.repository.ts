import type { AutomationsHealthResponse } from "./module.schema.js";

export class AutomationsRepository {
    async health(): Promise<AutomationsHealthResponse> {
        return {
            module: "automations",
            status: "ok"
        };
    }
}
import type { MarketingHealthResponse } from "./module.schema.js";

export class MarketingRepository {
    async health(): Promise<MarketingHealthResponse> {
        return {
            module: "marketing",
            status: "ok"
        };
    }
}
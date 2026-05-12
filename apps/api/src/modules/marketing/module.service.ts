import { MarketingRepository } from "./module.repository.js";
import type { MarketingHealthResponse } from "./module.schema.js";

export class MarketingService {
    constructor(private readonly marketingRepository = new MarketingRepository()) { }

    health(): Promise<MarketingHealthResponse> {
        return this.marketingRepository.health();
    }
}
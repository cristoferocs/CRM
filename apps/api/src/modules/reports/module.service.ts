import { ReportsRepository } from "./module.repository.js";
import type { ReportsHealthResponse } from "./module.schema.js";

export class ReportsService {
    constructor(private readonly reportsRepository = new ReportsRepository()) { }

    health(): Promise<ReportsHealthResponse> {
        return this.reportsRepository.health();
    }
}
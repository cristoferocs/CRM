import { ReportsRepository } from "./module.repository.js";
import type { DashboardRange, DashboardResponse, ReportsHealthResponse } from "./module.schema.js";

export class ReportsService {
    constructor(private readonly reportsRepository = new ReportsRepository()) { }

    health(): Promise<ReportsHealthResponse> {
        return this.reportsRepository.health();
    }

    dashboard(orgId: string, range: DashboardRange): Promise<DashboardResponse> {
        return this.reportsRepository.dashboard(orgId, range);
    }
}
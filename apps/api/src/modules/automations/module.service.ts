import { AutomationsRepository } from "./module.repository.js";
import type { AutomationsHealthResponse } from "./module.schema.js";

export class AutomationsService {
    constructor(private readonly automationsRepository = new AutomationsRepository()) { }

    health(): Promise<AutomationsHealthResponse> {
        return this.automationsRepository.health();
    }
}
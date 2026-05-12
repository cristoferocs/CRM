import { PipelineRepository } from "./module.repository.js";
import type { PipelineHealthResponse } from "./module.schema.js";

export class PipelineService {
    constructor(private readonly pipelineRepository = new PipelineRepository()) { }

    health(): Promise<PipelineHealthResponse> {
        return this.pipelineRepository.health();
    }
}
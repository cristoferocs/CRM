import type { PipelineHealthResponse } from "./module.schema.js";

export class PipelineRepository {
    async health(): Promise<PipelineHealthResponse> {
        return {
            module: "pipeline",
            status: "ok"
        };
    }
}
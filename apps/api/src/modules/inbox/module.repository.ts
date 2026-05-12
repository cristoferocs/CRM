import type { InboxHealthResponse } from "./module.schema.js";

export class InboxRepository {
    async health(): Promise<InboxHealthResponse> {
        return {
            module: "inbox",
            status: "ok"
        };
    }
}
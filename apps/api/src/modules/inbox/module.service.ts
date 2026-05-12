import { InboxRepository } from "./module.repository.js";
import type { InboxHealthResponse } from "./module.schema.js";

export class InboxService {
    constructor(private readonly inboxRepository = new InboxRepository()) { }

    health(): Promise<InboxHealthResponse> {
        return this.inboxRepository.health();
    }
}
import type { ContactsHealthResponse } from "./module.schema.js";

export class ContactsRepository {
    async health(): Promise<ContactsHealthResponse> {
        return {
            module: "contacts",
            status: "ok"
        };
    }
}
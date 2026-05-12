import { ContactsRepository } from "./module.repository.js";
import type { ContactsHealthResponse } from "./module.schema.js";

export class ContactsService {
    constructor(private readonly contactsRepository = new ContactsRepository()) { }

    health(): Promise<ContactsHealthResponse> {
        return this.contactsRepository.health();
    }
}
import { UsersRepository } from "./module.repository.js";
import type { UsersHealthResponse } from "./module.schema.js";

export class UsersService {
    constructor(private readonly usersRepository = new UsersRepository()) { }

    health(): Promise<UsersHealthResponse> {
        return this.usersRepository.health();
    }
}
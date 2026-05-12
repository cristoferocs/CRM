import type { UsersHealthResponse } from "./module.schema.js";

export class UsersRepository {
    async health(): Promise<UsersHealthResponse> {
        return {
            module: "users",
            status: "ok"
        };
    }
}
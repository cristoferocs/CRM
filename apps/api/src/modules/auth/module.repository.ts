import type { AuthHealthResponse } from "./module.schema.js";

export class AuthRepository {
    async health(): Promise<AuthHealthResponse> {
        return {
            module: "auth",
            status: "ok"
        };
    }
}
import { AuthRepository } from "./module.repository.js";
import type { AuthHealthResponse } from "./module.schema.js";

export class AuthService {
    constructor(private readonly authRepository = new AuthRepository()) { }

    health(): Promise<AuthHealthResponse> {
        return this.authRepository.health();
    }
}
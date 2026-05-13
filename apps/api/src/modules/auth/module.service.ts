import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdmin } from "../../lib/firebase.js";
import { AuthRepository } from "./module.repository.js";
import type { MeResponse } from "./module.schema.js";

export class AuthService {
    private readonly firebaseAuth = getAuth(getFirebaseAdmin());

    constructor(private readonly repo = new AuthRepository()) { }

    verifyFirebaseToken(token: string) {
        return this.firebaseAuth.verifyIdToken(token);
    }

    /**
     * Finds an existing user by Firebase UID or email (for first-time logins
     * of pre-invited users). Throws if the user is unknown or deactivated.
     */
    async loginOrRegister(firebaseUid: string, email: string) {
        // 1. Returning user — look up by Firebase UID
        const byUid = await this.repo.findByFirebaseUid(firebaseUid);
        if (byUid) {
            if (!byUid.isActive) {
                throw Object.assign(new Error("User account is deactivated."), { statusCode: 403 });
            }
            return byUid;
        }

        // 2. Invited user logging in for the first time — bind Firebase UID
        if (email) {
            const byEmail = await this.repo.findByEmail(email);
            if (byEmail) {
                return this.repo.updateFirebaseUid(byEmail.id, firebaseUid);
            }
        }

        throw Object.assign(
            new Error("User not registered. Please contact your administrator."),
            { statusCode: 401 },
        );
    }

    async me(userId: string): Promise<MeResponse> {
        const user = await this.repo.findById(userId);
        if (!user) {
            throw Object.assign(new Error("User not found."), { statusCode: 404 });
        }
        return user as unknown as MeResponse;
    }

    /**
     * Development-only login: bypasses Firebase and authenticates using
     * credentials stored in environment variables (DEFAULT_SUPER_ADMIN_*).
     * The user record is always fetched from the database — no data is
     * hardcoded here. Disabled in production.
     */
    async devLogin(email: string, password: string) {
        if (process.env.NODE_ENV === "production") {
            throw Object.assign(new Error("Dev login disabled in production"), { statusCode: 403 });
        }

        const expectedEmail = process.env.DEFAULT_SUPER_ADMIN_EMAIL;
        const expectedPassword = process.env.DEFAULT_SUPER_ADMIN_PASSWORD;

        if (!expectedEmail || !expectedPassword) {
            throw Object.assign(
                new Error(
                    "Dev login not configured. Set DEFAULT_SUPER_ADMIN_EMAIL and " +
                    "DEFAULT_SUPER_ADMIN_PASSWORD in your .env file.",
                ),
                { statusCode: 500 },
            );
        }

        if (email !== expectedEmail || password !== expectedPassword) {
            throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
        }

        const user = await this.repo.findByEmail(email);
        if (!user) {
            throw Object.assign(
                new Error(
                    "Admin user not found in the database. " +
                    "Run `pnpm db:seed` to provision the default account.",
                ),
                { statusCode: 404 },
            );
        }
        return user;
    }
}
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
}
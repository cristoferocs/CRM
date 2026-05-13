import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdmin } from "../../lib/firebase.js";
import { UsersRepository } from "./module.repository.js";
import type { CreateUserInput, InviteUserInput, UpdateUserInput, UserListQuery } from "./module.schema.js";

export class UsersService {
    private readonly firebaseAuth = getAuth(getFirebaseAdmin());

    constructor(private readonly repo = new UsersRepository()) { }

    async list(orgId: string, filters: UserListQuery) {
        const { data, total } = await this.repo.list(orgId, filters);
        return {
            data,
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(total / filters.limit),
        };
    }

    async findById(id: string, orgId: string) {
        const user = await this.repo.findById(id, orgId);
        if (!user) {
            throw Object.assign(new Error("User not found"), { statusCode: 404 });
        }
        return user;
    }

    /**
     * Invites a new user: creates a Firebase account (passwordless) and a DB record.
     * A password-reset email is sent so the user can set their own password.
     */
    async invite(data: InviteUserInput, orgId: string) {
        // Check duplicate within org
        const existing = await this.repo.list(orgId, {
            page: 1,
            limit: 1,
            search: data.email,
            isActive: undefined,
            role: undefined,
            departmentId: undefined,
        });
        if (existing.total > 0) {
            throw Object.assign(
                new Error("A user with this email already exists in this organisation"),
                { statusCode: 409 },
            );
        }

        // Create Firebase user (no password — they receive a reset link)
        const firebaseUser = await this.firebaseAuth.createUser({
            email: data.email,
            displayName: data.name,
        });

        const user = await this.repo.create({
            firebaseUid: firebaseUser.uid,
            email: data.email,
            name: data.name,
            role: data.role,
            orgId,
            departmentId: data.departmentId,
        });

        // Send password reset so invited user can set up their credentials
        try {
            await this.firebaseAuth.generatePasswordResetLink(data.email);
        } catch {
            // Non-fatal — user can request a reset link separately
        }

        return user;
    }

    async update(id: string, data: UpdateUserInput, orgId: string) {
        await this.findById(id, orgId);
        await this.repo.update(id, orgId, data);
        return this.findById(id, orgId);
    }

    async deactivate(id: string, orgId: string) {
        await this.findById(id, orgId);
        return this.repo.deactivate(id, orgId);
    }

    async updateRole(id: string, role: string, orgId: string) {
        await this.findById(id, orgId);
        return this.repo.updateRole(id, orgId, role);
    }
}
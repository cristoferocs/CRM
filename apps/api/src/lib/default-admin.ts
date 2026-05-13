import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdmin } from "./firebase.js";
import { prisma } from "./prisma.js";

/**
 * Reads the default SUPER_ADMIN identity from environment variables.
 * All three variables MUST be set — there are no hardcoded fallbacks.
 */
function getDefaultAdminConfig() {
    const email = process.env.DEFAULT_SUPER_ADMIN_EMAIL;
    const password = process.env.DEFAULT_SUPER_ADMIN_PASSWORD;
    const name = process.env.DEFAULT_SUPER_ADMIN_NAME;

    if (!email || !password || !name) {
        throw new Error(
            "Missing required env vars: DEFAULT_SUPER_ADMIN_EMAIL, " +
            "DEFAULT_SUPER_ADMIN_PASSWORD, DEFAULT_SUPER_ADMIN_NAME. " +
            "Define them in your .env file.",
        );
    }

    return { email, password, name };
}

/**
 * Best-effort: create (or fetch) the corresponding Firebase Auth user.
 * Failures (e.g. missing admin credentials in dev) are tolerated — a
 * placeholder UID is used and the real one is bound at first login via
 * the email-based fallback in AuthService.loginOrRegister.
 */
async function ensureFirebaseUser(): Promise<void> {
    try {
        const { email, password, name } = getDefaultAdminConfig();
        const auth = getAuth(getFirebaseAdmin());
        try {
            await auth.getUserByEmail(email);
        } catch {
            await auth.createUser({
                email,
                password,
                displayName: name,
                emailVerified: true,
            });
        }
    } catch (err) {
        // Firebase Admin SDK unavailable or config missing — DB row is still
        // created and will bind the real Firebase UID on first login.
        console.warn("[default-admin] Firebase user provisioning skipped:", (err as Error).message);
    }
}

/**
 * Idempotently creates the default SUPER_ADMIN User row for a given org.
 * Each org receives its own row with a deterministic synthetic firebaseUid
 * so the (firebaseUid @unique) constraint isn't violated across orgs.
 * The actual Firebase UID is bound on first login via email lookup.
 */
export async function ensureDefaultSuperAdmin(orgId: string) {
    await ensureFirebaseUser();

    const { email, name } = getDefaultAdminConfig();
    const placeholderUid = `default-admin:${orgId}`;

    const existing = await prisma.user.findFirst({
        where: { orgId, email },
    });

    if (existing) {
        return prisma.user.update({
            where: { id: existing.id },
            data: {
                role: "SUPER_ADMIN",
                isActive: true,
                branchId: null,
            },
        });
    }

    return prisma.user.create({
        data: {
            firebaseUid: placeholderUid,
            email,
            name,
            role: "SUPER_ADMIN",
            orgId,
            isActive: true,
        },
    });
}

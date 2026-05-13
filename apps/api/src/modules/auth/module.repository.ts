import { prisma } from "../../lib/prisma.js";

const userWithRelations = {
    org: { select: { id: true, name: true, slug: true, plan: true } },
    department: { select: { id: true, name: true } },
} as const;

export class AuthRepository {
    findByFirebaseUid(firebaseUid: string) {
        return prisma.user.findUnique({
            where: { firebaseUid },
            include: userWithRelations,
        });
    }

    findByEmail(email: string) {
        return prisma.user.findFirst({
            where: { email, isActive: true },
            include: userWithRelations,
        });
    }

    updateFirebaseUid(id: string, firebaseUid: string) {
        return prisma.user.update({
            where: { id },
            data: { firebaseUid },
            include: userWithRelations,
        });
    }

    findById(id: string) {
        return prisma.user.findUnique({
            where: { id },
            include: userWithRelations,
        });
    }
}
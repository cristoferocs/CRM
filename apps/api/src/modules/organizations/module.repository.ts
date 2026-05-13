import { prisma } from "../../lib/prisma.js";
import type { CreateOrganizationInput, UpdateOrganizationInput, OrganizationSettingsInput } from "./module.schema.js";

const DEFAULT_STAGES = [
    { name: "Novo Lead", order: 1, color: "#94a3b8", probability: 10, isWon: false, isLost: false },
    { name: "Qualificado", order: 2, color: "#60a5fa", probability: 25, isWon: false, isLost: false },
    { name: "Proposta", order: 3, color: "#f59e0b", probability: 50, isWon: false, isLost: false },
    { name: "Negociação", order: 4, color: "#f97316", probability: 75, isWon: false, isLost: false },
    { name: "Fechado", order: 5, color: "#22c55e", probability: 100, isWon: true, isLost: false },
] as const;

export class OrganizationsRepository {
    create(data: CreateOrganizationInput) {
        return prisma.organization.create({
            data: {
                name: data.name,
                slug: data.slug,
                plan: data.plan ?? "STARTER",
                settings: (data.settings as object | undefined) ?? {},
            },
        });
    }

    createDefaultPipeline(orgId: string) {
        return prisma.pipeline.create({
            data: {
                name: "Pipeline Comercial",
                isDefault: true,
                orgId,
                stages: { createMany: { data: DEFAULT_STAGES.map((s) => ({ ...s })) } },
            },
        });
    }

    findById(id: string) {
        return prisma.organization.findUnique({ where: { id } });
    }

    update(id: string, data: UpdateOrganizationInput) {
        return prisma.organization.update({ where: { id }, data });
    }

    findSettings(orgId: string) {
        return prisma.organization.findUnique({
            where: { id: orgId },
            select: { settings: true },
        });
    }

    updateSettings(orgId: string, settings: OrganizationSettingsInput) {
        return prisma.organization.update({
            where: { id: orgId },
            data: { settings: settings as object },
            select: { id: true, settings: true },
        });
    }
}
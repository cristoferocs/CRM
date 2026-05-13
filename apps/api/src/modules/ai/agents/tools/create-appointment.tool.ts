import { z } from "zod";
import { GoogleWorkspaceClient } from "../../../../lib/google-workspace.js";
import { prisma } from "../../../../lib/prisma.js";

export const name = "create_appointment";
export const description =
    "Cria um agendamento no Google Calendar com o contato e registra uma Activity no CRM.";

export const parametersSchema = z.object({
    datetime: z.string().describe("Data e hora no formato ISO 8601 (ex: 2026-05-20T10:00:00)"),
    duration: z.number().int().min(15).max(480).describe("Duração em minutos"),
    title: z.string().min(1).describe("Título do evento"),
    description: z.string().optional().describe("Descrição ou pauta do evento"),
});

export interface ToolContext {
    orgId: string;
    contactId: string;
    conversationId: string;
    agentId: string;
}

export async function execute(
    params: z.infer<typeof parametersSchema>,
    context: ToolContext,
): Promise<string> {
    const gws = new GoogleWorkspaceClient(context.orgId);
    const status = await gws.getStatus();
    if (!status.connected) {
        return "Google Calendar não está conectado para esta organização.";
    }

    // Fetch contact email for attendees
    const contact = await prisma.contact.findFirst({
        where: { id: context.contactId, orgId: context.orgId },
        select: { email: true, name: true },
    });

    const eventLink = await gws.createEvent({
        title: params.title,
        description: params.description,
        startDatetime: params.datetime,
        durationMinutes: params.duration,
        attendeeEmail: contact?.email ?? undefined,
    });

    // Find most recent open deal for the contact to attach the activity
    const deal = await prisma.deal.findFirst({
        where: { contactId: context.contactId, orgId: context.orgId, isActive: true },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
    });

    // Save activity in CRM (use a system user ID placeholder — activities require userId)
    const systemUser = await prisma.user.findFirst({
        where: { orgId: context.orgId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
    });

    if (systemUser) {
        await prisma.activity.create({
            data: {
                type: "MEETING",
                title: params.title,
                description: params.description,
                dueAt: new Date(params.datetime),
                dealId: deal?.id ?? undefined,
                contactId: context.contactId,
                userId: systemUser.id,
                orgId: context.orgId,
            },
        });
    }

    return `Agendamento criado com sucesso! 📅\nEvento: ${params.title}\nData: ${new Date(params.datetime).toLocaleString("pt-BR")}\nLink: ${eventLink}`;
}

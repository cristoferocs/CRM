import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";

export const name = "get_contact_info";
export const description =
    "Busca informações detalhadas do contato atual: nome, email, telefone, tags, custom fields e os últimos 5 eventos da timeline.";

export const parametersSchema = z.object({});

export interface ToolContext {
    orgId: string;
    contactId: string;
    conversationId: string;
    agentId: string;
}

export async function execute(
    _params: z.infer<typeof parametersSchema>,
    context: ToolContext,
): Promise<string> {
    const contact = await prisma.contact.findFirst({
        where: { id: context.contactId, orgId: context.orgId },
        include: {
            timeline: { orderBy: { createdAt: "desc" }, take: 5 },
            company: { select: { name: true, segment: true } },
        },
    });

    if (!contact) return "Contato não encontrado.";

    const lines = [
        `Nome: ${contact.name}`,
        `Email: ${contact.email ?? "—"}`,
        `Telefone: ${contact.phone ?? "—"}`,
        `Tipo: ${contact.type}`,
        `Origem: ${contact.source}`,
        `Tags: ${contact.tags.length > 0 ? contact.tags.join(", ") : "nenhuma"}`,
        contact.company ? `Empresa: ${contact.company.name} (${contact.company.segment ?? "—"})` : "",
        "",
        "Últimos eventos:",
        ...contact.timeline.map((e) => `• ${e.title} — ${e.createdAt.toLocaleDateString("pt-BR")}`),
    ].filter(Boolean);

    return lines.join("\n");
}

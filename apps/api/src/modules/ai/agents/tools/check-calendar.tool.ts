import { z } from "zod";
import { GoogleWorkspaceClient } from "../../../../lib/google-workspace.js";

export const name = "check_calendar";
export const description =
    "Verifica disponibilidade na agenda Google Calendar para agendamentos. Retorna slots livres no dia solicitado.";

export const parametersSchema = z.object({
    date: z.string().describe("Data no formato YYYY-MM-DD"),
    duration: z.number().int().min(15).max(480).describe("Duração em minutos"),
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

    const date = new Date(params.date + "T00:00:00");
    const slots = await gws.getAvailableSlots(date, params.duration);

    if (slots.length === 0) {
        return `Nenhum horário disponível em ${params.date} para ${params.duration} minutos.`;
    }

    const lines = slots.map((s) => {
        const start = new Date(s.start).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
        });
        const end = new Date(s.end).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
        });
        return `• ${start} – ${end}`;
    });

    return `Horários disponíveis em ${params.date}:\n${lines.join("\n")}`;
}

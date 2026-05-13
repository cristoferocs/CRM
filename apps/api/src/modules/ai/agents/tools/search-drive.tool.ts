import { z } from "zod";
import { GoogleWorkspaceClient } from "../../../../lib/google-workspace.js";

export const name = "search_drive";
export const description =
    "Busca documentos no Google Drive da empresa (propostas, contratos, materiais de vendas, apresentações).";

export const parametersSchema = z.object({
    query: z.string().min(1).describe("Termo de busca para encontrar documentos no Drive"),
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
        return "Google Drive não está conectado para esta organização.";
    }

    const files = await gws.searchFiles(params.query);
    if (files.length === 0) {
        return `Nenhum arquivo encontrado no Drive para: "${params.query}"`;
    }

    return files
        .map((f) => `• ${f.name} (${f.mimeType.split("/").pop()})\n  ${f.webViewLink}`)
        .join("\n");
}

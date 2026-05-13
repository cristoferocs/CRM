// @ts-ignore — pdf-parse ships a default export but types may differ
import pdfParse from "pdf-parse/lib/pdf-parse.js";

/**
 * Extracts clean text from a PDF buffer.
 * Strips common header/footer artefacts (page numbers, repeated short lines).
 */
export async function extractPdf(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    const rawText: string = data.text ?? "";

    // Split into lines, deduplicate short repeated lines (headers/footers)
    const lines = rawText.split("\n");
    const lineFrequency = new Map<string, number>();
    for (const line of lines) {
        const key = line.trim();
        if (key.length > 0 && key.length < 80) {
            lineFrequency.set(key, (lineFrequency.get(key) ?? 0) + 1);
        }
    }

    const pageCount = data.numpages ?? 1;
    const threshold = Math.max(2, Math.floor(pageCount * 0.4));

    const cleaned = lines
        .filter((line) => {
            const key = line.trim();
            if (key.length === 0) return false;
            // Remove lines that appear too frequently (likely headers/footers)
            if ((lineFrequency.get(key) ?? 0) >= threshold) return false;
            return true;
        })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return cleaned;
}

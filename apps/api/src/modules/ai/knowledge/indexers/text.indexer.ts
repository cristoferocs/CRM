/**
 * Text indexer — normalizes plain text input for indexing.
 * Strips excessive whitespace and normalizes line endings.
 */
export function normalizeText(raw: string): string {
    return raw
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim();
}

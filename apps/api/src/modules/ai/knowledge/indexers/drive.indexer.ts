import axios from "axios";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

interface DriveFileMetadata {
    id: string;
    name: string;
    mimeType: string;
}

/**
 * Fetches a Google Drive document and returns its plain text content.
 * Requires GOOGLE_DRIVE_ACCESS_TOKEN or relies on Application Default Credentials
 * via the metadata server when running on GCP.
 */
export async function fetchDriveDocument(fileId: string): Promise<string> {
    const token = await getAccessToken();

    // Get file metadata to determine MIME type
    const metaResponse = await axios.get<DriveFileMetadata>(
        `${DRIVE_API}/files/${fileId}?fields=id,name,mimeType`,
        { headers: { Authorization: `Bearer ${token}` } },
    );

    const { mimeType } = metaResponse.data;

    // Google Workspace documents must be exported
    let exportMime = "text/plain";
    let endpoint = `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;

    if (mimeType === "application/pdf") {
        // Download the PDF and return as base64 — caller will use pdf.indexer
        const resp = await axios.get<ArrayBuffer>(
            `${DRIVE_API}/files/${fileId}?alt=media`,
            {
                headers: { Authorization: `Bearer ${token}` },
                responseType: "arraybuffer",
            },
        );
        const buffer = Buffer.from(resp.data);
        return `__PDF_BUFFER__:${buffer.toString("base64")}`;
    }

    if (
        mimeType === "application/vnd.google-apps.spreadsheet" ||
        mimeType === "application/vnd.google-apps.presentation"
    ) {
        exportMime = "text/csv";
        endpoint = `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
    }

    const response = await axios.get<string>(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "text",
    });

    return response.data;
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string> {
    // Prefer explicit token in env (dev / service account key)
    if (process.env.GOOGLE_DRIVE_ACCESS_TOKEN) {
        return process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
    }

    // Fall back to GCP metadata server (production)
    try {
        const resp = await axios.get<{ access_token: string }>(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
            {
                headers: { "Metadata-Flavor": "Google" },
                timeout: 3_000,
            },
        );
        return resp.data.access_token;
    } catch {
        throw new Error(
            "Google Drive token não disponível. " +
            "Configure GOOGLE_DRIVE_ACCESS_TOKEN ou execute em ambiente GCP.",
        );
    }
}

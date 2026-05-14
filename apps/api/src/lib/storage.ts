import { Storage } from "@google-cloud/storage";
import { fileTypeFromBuffer } from "file-type";

let storage: Storage | null = null;

export function getStorage() {
    if (!storage) {
        storage = new Storage({
            projectId: process.env.GOOGLE_CLOUD_PROJECT,
        });
    }

    return storage;
}

export function getStorageBucket() {
    // Canonical env var documented in .env.example
    const bucketName = process.env.GCS_BUCKET;

    if (!bucketName) {
        throw new Error("GCS_BUCKET environment variable is required");
    }

    return getStorage().bucket(bucketName);
}

/**
 * Generates a short-lived signed URL so the client can upload directly to
 * Cloud Storage without routing the bytes through the API server.
 *
 * @param objectPath  Destination path inside the bucket (e.g. "uploads/orgId/file.pdf")
 * @param contentType MIME type the client will send in the PUT request
 * @returns           { uploadUrl, publicUrl, expiresAt }
 */
export async function generateSignedUploadUrl(
    objectPath: string,
    contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string; expiresAt: Date }> {
    const expirySeconds = Number(process.env.GCS_SIGNED_URL_EXPIRY ?? 900);
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);

    const bucket = getStorageBucket();
    const file = bucket.file(objectPath);

    const [uploadUrl] = await file.generateSignedPostPolicyV4({
        expires: expiresAt,
        conditions: [
            ["content-length-range", 0, Number(process.env.MAX_UPLOAD_SIZE_BYTES ?? 10 * 1024 * 1024)],
            ["eq", "$Content-Type", contentType],
        ],
        fields: { "Content-Type": contentType },
    });

    const bucketName = process.env.GCS_BUCKET!;
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${objectPath}`;

    return { uploadUrl: uploadUrl.url, publicUrl, expiresAt };
}

/**
 * Sniff the magic bytes of an already-uploaded object and confirm the
 * actual file type matches the MIME the client declared at signing time.
 *
 * Why: GCS's signed POST policy enforces the `Content-Type` *header*
 * field, but the client controls the bytes. A malicious actor can ship
 * an executable / HTML payload labeled as image/jpeg unless we look at
 * the leading bytes ourselves.
 *
 * Deletes the object on mismatch so we never leak a misrepresented file
 * back as a `publicUrl`.
 */
export async function verifyUploadedFile(
    objectPath: string,
    expectedContentType: string,
    allowedMimeTypes: Set<string>,
): Promise<
    | { ok: true; detectedMime: string }
    | { ok: false; reason: "no_magic_bytes" | "mime_mismatch" | "mime_not_allowed"; detectedMime?: string }
> {
    const bucket = getStorageBucket();
    const file = bucket.file(objectPath);

    // 4 KiB is enough for every signature `file-type` ships — most are
    // in the first 16 bytes.
    const SNIFF_BYTES = 4096;
    const stream = file.createReadStream({ start: 0, end: SNIFF_BYTES - 1 });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
        if (Buffer.concat(chunks).length >= SNIFF_BYTES) break;
    }
    const head = Buffer.concat(chunks);
    const detected = await fileTypeFromBuffer(head);

    if (!detected) {
        // Plain text files (csv, txt) have no magic bytes. Only let them
        // pass if the declared MIME is one of the text whitelist entries.
        const isPlainText = expectedContentType === "text/plain" || expectedContentType === "text/csv";
        if (isPlainText && allowedMimeTypes.has(expectedContentType)) {
            return { ok: true, detectedMime: expectedContentType };
        }
        await file.delete({ ignoreNotFound: true }).catch(() => undefined);
        return { ok: false, reason: "no_magic_bytes" };
    }

    if (!allowedMimeTypes.has(detected.mime)) {
        await file.delete({ ignoreNotFound: true }).catch(() => undefined);
        return { ok: false, reason: "mime_not_allowed", detectedMime: detected.mime };
    }

    if (detected.mime !== expectedContentType) {
        await file.delete({ ignoreNotFound: true }).catch(() => undefined);
        return { ok: false, reason: "mime_mismatch", detectedMime: detected.mime };
    }

    return { ok: true, detectedMime: detected.mime };
}

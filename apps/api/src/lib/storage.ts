import { Storage } from "@google-cloud/storage";

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

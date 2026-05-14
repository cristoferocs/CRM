import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { generateSignedUploadUrl, verifyUploadedFile } from "../../lib/storage.js";

const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "video/mp4",
    "video/webm",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
]);

const SignUploadBody = z.object({
    filename: z.string().min(1).max(260),
    contentType: z.string().min(1).max(128),
});

const ValidateUploadBody = z.object({
    objectPath: z.string().min(1).max(1024),
    contentType: z.string().min(1).max(128),
});

export const uploadsRoutes: FastifyPluginAsync = async (fastify) => {
    /**
     * POST /uploads/sign
     *
     * Returns a signed POST policy URL so the client can upload directly to
     * Cloud Storage without routing bytes through the API server.
     *
     * Security:
     *  - Requires valid JWT (orgId scoping).
     *  - Only allows a whitelist of MIME types to prevent arbitrary file hosting.
     *  - Object path is always scoped to the org: uploads/{orgId}/{uuid}/{filename}
     *  - The companion `/uploads/validate` endpoint MUST be called after upload
     *    to confirm the bytes actually match the declared MIME (magic-byte sniff).
     */
    fastify.post(
        "/sign",
        {
            onRequest: [fastify.verifyJWT],
            schema: { body: SignUploadBody },
        },
        async (request, reply) => {
            const { filename, contentType } = request.body as z.infer<typeof SignUploadBody>;
            const orgId = request.user.orgId!;

            if (!ALLOWED_MIME_TYPES.has(contentType)) {
                return reply.status(400).send({ message: `Content-Type "${contentType}" is not allowed.` });
            }

            // Sanitize the filename to prevent path traversal
            const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
            const objectPath = `uploads/${orgId}/${randomUUID()}/${safeName}`;

            const result = await generateSignedUploadUrl(objectPath, contentType);
            return reply.status(200).send(result);
        },
    );

    /**
     * POST /uploads/validate
     *
     * Called by the client immediately after a successful upload to GCS. We
     * download the first 4 KiB of the object and run `file-type`'s magic-byte
     * detector against it to confirm the file is actually what the client
     * claimed. Mismatched / unrecognized files are deleted from the bucket
     * so a malicious upload is never reachable by `publicUrl`.
     *
     * The client should treat a non-200 response as "upload rejected" and
     * not persist the publicUrl anywhere.
     */
    fastify.post(
        "/validate",
        {
            onRequest: [fastify.verifyJWT],
            schema: { body: ValidateUploadBody },
        },
        async (request, reply) => {
            const { objectPath, contentType } = request.body as z.infer<typeof ValidateUploadBody>;
            const orgId = request.user.orgId!;

            // Defense in depth: refuse to validate paths that aren't scoped to
            // the caller's org. Prevents one tenant from deleting another's
            // uploads by guessing object paths.
            if (!objectPath.startsWith(`uploads/${orgId}/`)) {
                return reply.status(403).send({ message: "Object path does not belong to this organization." });
            }
            if (!ALLOWED_MIME_TYPES.has(contentType)) {
                return reply.status(400).send({ message: `Content-Type "${contentType}" is not allowed.` });
            }

            const result = await verifyUploadedFile(objectPath, contentType, ALLOWED_MIME_TYPES);
            if (!result.ok) {
                request.log.warn(
                    { orgId, objectPath, expected: contentType, ...result },
                    "upload rejected after magic-byte check",
                );
                return reply.status(400).send({
                    message: "Uploaded file did not match its declared type.",
                    reason: result.reason,
                    detectedMime: result.detectedMime ?? null,
                });
            }
            return reply.status(200).send({ ok: true, detectedMime: result.detectedMime });
        },
    );
};

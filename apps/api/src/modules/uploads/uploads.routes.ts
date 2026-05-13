import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { generateSignedUploadUrl } from "../../lib/storage.js";

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
};

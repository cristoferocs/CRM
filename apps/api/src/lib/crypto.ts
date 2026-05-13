/**
 * AES-256-GCM symmetric encryption for storing sensitive tokens in the database.
 * The encryption key is derived from APP_SECRET via SHA-256.
 *
 * Format:  iv:authTag:ciphertext  (all hex-encoded, colon-delimited)
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
    const secret = process.env.APP_SECRET ?? process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error(
            "APP_SECRET (or JWT_SECRET) environment variable is required and must be at least 32 characters long for token encryption."
        );
    }
    return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(12); // 96-bit nonce for GCM
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decrypt(encoded: string): string {
    const [ivHex, authTagHex, ciphertextHex] = encoded.split(":");
    if (!ivHex || !authTagHex || !ciphertextHex) {
        throw new Error("Formato de token criptografado inválido");
    }

    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

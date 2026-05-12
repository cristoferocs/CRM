import { Storage } from "@google-cloud/storage";

let storage: Storage | null = null;

export function getStorage() {
    if (!storage) {
        storage = new Storage({
            projectId: process.env.GOOGLE_CLOUD_PROJECT
        });
    }

    return storage;
}

export function getStorageBucket() {
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;

    if (!bucketName) {
        throw new Error("GOOGLE_CLOUD_STORAGE_BUCKET is required");
    }

    return getStorage().bucket(bucketName);
}
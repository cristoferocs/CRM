import { PubSub } from "@google-cloud/pubsub";

let pubsub: PubSub | null = null;

export function getPubSub() {
    if (!pubsub) {
        pubsub = new PubSub({
            projectId: process.env.GOOGLE_CLOUD_PROJECT
        });
    }

    return pubsub;
}
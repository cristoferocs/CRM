import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";

export function getFirebaseAdmin(): App {
    const [app] = getApps();

    if (app) {
        return app;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (projectId && clientEmail && privateKey) {
        return initializeApp({
            credential: cert({
                projectId,
                clientEmail,
                privateKey
            })
        });
    }

    return initializeApp({
        credential: applicationDefault(),
        projectId
    });
}
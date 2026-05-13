import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// Build-safe fallbacks. The real values come from NEXT_PUBLIC_* env vars at
// runtime. Using non-empty placeholders here keeps initializeApp from
// throwing during the Next.js static-export phase when env vars aren't set.
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "build-placeholder",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "build.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "build-placeholder",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "build-placeholder.appspot.com",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "0",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:0:web:0",
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

function getFirebaseApp(): FirebaseApp {
    if (_app) return _app;
    _app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
    return _app;
}

export function getFirebaseAuth(): Auth {
    if (_auth) return _auth;
    _auth = getAuth(getFirebaseApp());
    return _auth;
}

// Backwards-compat exports — evaluated lazily via Proxy-like getters.
export const firebaseApp = new Proxy({} as FirebaseApp, {
    get: (_t, prop) => Reflect.get(getFirebaseApp() as object, prop),
});
export const firebaseAuth = new Proxy({} as Auth, {
    get: (_t, prop) => Reflect.get(getFirebaseAuth() as object, prop),
});

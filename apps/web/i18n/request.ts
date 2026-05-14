/**
 * next-intl request config — runs on the server per request and decides
 * which message catalog to send to the client.
 *
 * Locale resolution order:
 *   1. `NEXT_LOCALE` cookie (set by a future user-facing language picker)
 *   2. `accept-language` header (first locale we have a catalog for)
 *   3. Fallback to pt-BR
 *
 * No URL-based locale routing — the app stays at `/`, locale lives in
 * a cookie. This keeps the migration zero-disruption: existing routes
 * keep working, components can adopt `useTranslations` incrementally.
 */
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

const SUPPORTED = ["pt-BR", "en", "es"] as const;
type Locale = (typeof SUPPORTED)[number];
const DEFAULT_LOCALE: Locale = "pt-BR";

function pickLocale(rawCookie: string | undefined, acceptLanguage: string | undefined): Locale {
    if (rawCookie && (SUPPORTED as readonly string[]).includes(rawCookie)) {
        return rawCookie as Locale;
    }
    if (acceptLanguage) {
        for (const tag of acceptLanguage.split(",")) {
            const lang = tag.split(";")[0]?.trim();
            if (!lang) continue;
            if ((SUPPORTED as readonly string[]).includes(lang)) return lang as Locale;
            // Match `pt-*` to pt-BR, `en-*` to en, `es-*` to es.
            const prefix = lang.split("-")[0];
            const match = SUPPORTED.find((l) => l.toLowerCase().startsWith(prefix + "-") || l === prefix);
            if (match) return match;
        }
    }
    return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const locale = pickLocale(
        cookieStore.get("NEXT_LOCALE")?.value,
        headerStore.get("accept-language") ?? undefined,
    );
    const messages = (await import(`./messages/${locale}.json`)).default;
    return { locale, messages };
});

export interface WhiteLabelPublicSettings {
    platformName: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    loginBackground: string | null;
    loginTagline: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export const DEFAULT_WHITE_LABEL: WhiteLabelPublicSettings = {
    platformName: process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "CRM Base",
    logoUrl: null,
    faviconUrl: null,
    primaryColor: "#5b5bff",
    secondaryColor: "#00e5c0",
    accentColor: "#ff5b8d",
    loginBackground: null,
    loginTagline: null,
};

export async function getWhiteLabelByDomain(
    domain: string,
): Promise<WhiteLabelPublicSettings | null> {
    try {
        const res = await fetch(
            `${API_BASE}/public/white-label?domain=${encodeURIComponent(domain)}`,
            { next: { revalidate: 300 } }, // 5-min server-side cache
        );
        if (!res.ok) return null;
        return (await res.json()) as WhiteLabelPublicSettings;
    } catch {
        return null;
    }
}

export function getDefaultWhiteLabel(): WhiteLabelPublicSettings {
    return { ...DEFAULT_WHITE_LABEL };
}

/**
 * Applies white-label settings to the DOM:
 * — CSS custom properties on :root
 * — document.title
 * — favicon <link> element
 *
 * Must be called from a client component (browser only).
 */
export function applyWhiteLabel(settings: WhiteLabelPublicSettings): void {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    root.style.setProperty("--color-primary", settings.primaryColor);
    root.style.setProperty("--color-secondary", settings.secondaryColor);
    root.style.setProperty("--color-accent", settings.accentColor);

    // Derive lighter/darker shades for hover states (simple alpha variants)
    root.style.setProperty("--color-primary-hover", settings.primaryColor + "cc");

    document.title = settings.platformName;

    // Favicon
    if (settings.faviconUrl) {
        let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
        if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
        }
        link.href = settings.faviconUrl;
    }
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { WhiteLabelProvider } from "@/components/white-label-provider";
import { getDefaultWhiteLabel, getWhiteLabelByDomain } from "@/lib/white-label";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "CRM Base",
  description: "White-label CRM",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  // Strip port for local dev (localhost:3000 → localhost)
  const domain = host.split(":")[0];

  const wl =
    domain && domain !== "localhost"
      ? ((await getWhiteLabelByDomain(domain)) ?? getDefaultWhiteLabel())
      : getDefaultWhiteLabel();

  // Locale + message catalog resolved server-side by `apps/web/i18n/request.ts`
  // — falls back to pt-BR when no NEXT_LOCALE cookie / accept-language hint.
  const locale = await getLocale();
  const messages = await getMessages();
  const skipToContent =
    (messages as { auth?: { skipToContent?: string } })?.auth?.skipToContent ??
    "Pular para o conteúdo principal";

  return (
    <html lang={locale}>
      <head>
        <meta name="theme-color" content={wl.primaryColor} />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          {skipToContent}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <WhiteLabelProvider settings={wl} />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

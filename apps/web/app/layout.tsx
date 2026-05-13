import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { WhiteLabelProvider } from "@/components/white-label-provider";
import { getDefaultWhiteLabel, getWhiteLabelByDomain } from "@/lib/white-label";

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

  return (
    <html lang="pt-BR">
      <head>
        <meta name="theme-color" content={wl.primaryColor} />
      </head>
      <body>
        <WhiteLabelProvider settings={wl} />
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "crm-base",
  description: "White-label CRM base"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
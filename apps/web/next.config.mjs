import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Tell next-intl where the request-config lives. Locale data ships to the
// client via NextIntlClientProvider in app/layout.tsx.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" output is enabled in CI/Docker builds via the
  // NEXT_OUTPUT_STANDALONE env flag. On local Windows it requires admin
  // privileges (symlinks) and is skipped by default.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1" ? { output: "standalone" } : {}),
  transpilePackages: ["@crm-base/ui", "@crm-base/shared"],
  experimental: {
    // Barrel-file tree-shaking for the heaviest deps. Without this, importing
    // a single icon from lucide-react pulls in the entire icon set; same idea
    // for the other libraries below.
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@xyflow/react",
      "date-fns",
      "@radix-ui/react-icons",
    ],
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));

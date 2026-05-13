/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" output is enabled in CI/Docker builds via the
  // NEXT_OUTPUT_STANDALONE env flag. On local Windows it requires admin
  // privileges (symlinks) and is skipped by default.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1" ? { output: "standalone" } : {}),
  transpilePackages: ["@crm-base/ui", "@crm-base/shared"]
};

export default nextConfig;
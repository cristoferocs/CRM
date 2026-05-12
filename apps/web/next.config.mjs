/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@crm-base/ui", "@crm-base/shared"]
};

export default nextConfig;
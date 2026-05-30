import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel build uses standalone; the Cloudflare/OpenNext build sets CF_BUILD=1
  // and must NOT use standalone (OpenNext does its own bundling).
  output: process.env.CF_BUILD ? undefined : "standalone",
  typescript: {
    ignoreBuildErrors: true, // TODO: fix TS errors and remove
  },
  reactStrictMode: true,
};

export default nextConfig;

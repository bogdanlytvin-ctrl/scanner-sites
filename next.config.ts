import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true, // TODO: fix TS errors and remove
  },
  reactStrictMode: true,
};

export default nextConfig;

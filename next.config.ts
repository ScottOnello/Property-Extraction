import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { optimizePackageImports: [] },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Ignore ESLint errors during production builds (for MVP)
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Don't fail on TypeScript errors during production builds (optional)
    // ignoreBuildErrors: false,
  },
};

export default nextConfig;

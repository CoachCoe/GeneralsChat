import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint runs as part of `next build`. It was previously disabled here
  // ("ignoreDuringBuilds: true, for MVP"), which -- combined with a `lint`
  // script that scanned an untracked stray directory and CI that never ran
  // eslint at all -- meant no path existed by which a lint error could block
  // anything. Scoped lint is clean, so the suppression protected nothing.
  // (SEC-18, REPO-4)
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with only the traced runtime dependencies, which
  // takes the deployed image from ~1.5GB to a couple of hundred MB. On a
  // container platform that is cold-start time and registry cost on every
  // revision. `next start` still works locally -- the standalone tree is
  // produced alongside the normal build, not instead of it.
  output: 'standalone',

  // ESLint runs as part of `next build`. It was previously disabled here
  // ("ignoreDuringBuilds: true, for MVP"), which -- combined with a `lint`
  // script that scanned an untracked stray directory and CI that never ran
  // eslint at all -- meant no path existed by which a lint error could block
  // anything. Scoped lint is clean, so the suppression protected nothing.
  // (SEC-18, REPO-4)
};

export default nextConfig;

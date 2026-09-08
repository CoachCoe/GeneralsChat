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

  /**
   * Security response headers.
   *
   * There were none. This application holds incident records about minors and
   * renders model output as markdown, and model output is downstream of both
   * the incident text and uploaded policy documents -- so it is a
   * prompt-injection sink with a browser attached. `GuidanceBlock` refuses
   * images and constrains link schemes (SEC-33); a CSP is the backstop for
   * everything that is not markdown.
   *
   * `script-src` allows 'unsafe-inline' because Next's App Router inlines
   * bootstrap and flight-data scripts; tightening that needs a nonce plumbed
   * through the middleware, which is a larger change than this audit should
   * make. `img-src` allows `data:` for the same reason Next's image handling
   * does, and `self` for the two static assets in public/. What matters most
   * here is `connect-src 'self'` and `frame-ancestors 'none'`: the first bounds
   * where a page can send data, the second means this app cannot be framed by
   * a site building a clickjacked "Mark done".
   *
   * `default-src 'none'` is deliberate, so anything not named above is
   * refused rather than inheriting a permissive default. (SEC-38)
   */
  async headers() {
    const csp = [
      "default-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // No Referer to another origin: the path carries an incident id.
          { key: 'Referrer-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          // Only meaningful over HTTPS, which is what the deployment serves.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

/**
 * Where sign-in may send the administrator afterwards.
 *
 * `callbackUrl` was read from the query string and pushed straight into the
 * router, so `/login?callbackUrl=https://evil.test/` redirected off-site
 * immediately after a successful sign-in -- from a link whose domain is
 * genuinely this application's, on the page where a convincing look-alike is
 * worth the most.
 *
 * Lives in `src/lib` rather than beside the page because it is pure, and the
 * property it has is worth a test.
 */

/** A relative, same-origin path, or `/`. Never a URL to another host. */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return '/';

  // Must be a single-slash-rooted path. `//host` is protocol-relative, and
  // `/\host` is treated as protocol-relative by some browsers.
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';

  return raw;
}

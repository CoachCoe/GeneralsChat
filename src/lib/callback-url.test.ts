import { describe, expect, it } from 'vitest';
import { safeCallbackUrl } from './callback-url';

/**
 * `callbackUrl` was taken from the query string and pushed straight into the
 * router after a successful sign-in, so `/login?callbackUrl=https://evil/`
 * redirected the administrator off-site from a link on this app's own domain --
 * on the page where a convincing look-alike is worth the most. (FLOW-55)
 */
describe('safeCallbackUrl', () => {
  it('keeps an ordinary in-app path', () => {
    expect(safeCallbackUrl('/incidents')).toBe('/incidents');
    expect(safeCallbackUrl('/incidents/abc123?segment=all')).toBe('/incidents/abc123?segment=all');
  });

  it('falls back to the home page when there is nothing to honour', () => {
    expect(safeCallbackUrl(null)).toBe('/');
    expect(safeCallbackUrl(undefined)).toBe('/');
    expect(safeCallbackUrl('')).toBe('/');
  });

  it('refuses an absolute URL to another origin', () => {
    for (const value of [
      'https://evil.test/',
      'http://evil.test/login',
      'https://evil.test/?next=/incidents',
    ]) {
      expect(safeCallbackUrl(value), value).toBe('/');
    }
  });

  it('refuses a protocol-relative URL, which is also off-site', () => {
    expect(safeCallbackUrl('//evil.test/')).toBe('/');
    expect(safeCallbackUrl('//evil.test')).toBe('/');
  });

  it('refuses a backslash-rooted URL, which some browsers treat as protocol-relative', () => {
    expect(safeCallbackUrl('/\\evil.test')).toBe('/');
  });

  it('refuses a scheme that would execute or open a client', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,<script>', 'mailto:a@b.test']) {
      expect(safeCallbackUrl(value), value).toBe('/');
    }
  });
});

import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Guarded outbound fetch for user-supplied URLs.
 *
 * Without this, `fetch(formData.get('url'))` is a read-anything-the-server-
 * can-reach oracle: cloud metadata endpoints (169.254.169.254), internal
 * services, and localhost are all reachable, and the response body was
 * stored where it could be read back out. (SEC-4)
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/** RFC1918, loopback, link-local, CGNAT, and the IPv6 equivalents. */
function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // unparseable: refuse rather than guess
  }
  const [a, b] = parts;
  if (a === 0) return true;                        // 0.0.0.0/8
  if (a === 10) return true;                       // 10.0.0.0/8 private
  if (a === 127) return true;                      // loopback
  if (a === 169 && b === 254) return true;         // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true;         // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true;           // 192.0.0.0/24 protocol assignments
  if (a >= 224) return true;                       // multicast + reserved
  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0];
  if (addr === '::' || addr === '::1') return true;          // unspecified, loopback
  if (addr.startsWith('fe80')) return true;                  // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  if (addr.startsWith('ff')) return true;                    // multicast
  // IPv4-mapped (::ffff:169.254.169.254) must be judged as IPv4.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip);
  return true;
}

/**
 * Rejects the URL unless it is https and every address its hostname
 * resolves to is publicly routable.
 *
 * Note: this validates at resolution time, so it does not by itself defeat
 * a DNS-rebinding attacker who flips the record between this check and the
 * connection. Closing that gap requires pinning the resolved address into
 * the socket, which the platform fetch does not expose. The allowlist
 * recommended in the audit (SEC-4) is the stronger control.
 */
async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Malformed URL');
  }

  if (url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only https URLs are allowed');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isBlockedAddress(host)) {
      throw new UnsafeUrlError('URL resolves to a non-public address');
    }
    return url;
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError('Hostname could not be resolved');
  }
  if (records.length === 0 || records.some((r) => isBlockedAddress(r.address))) {
    throw new UnsafeUrlError('URL resolves to a non-public address');
  }
  return url;
}

export interface SafeFetchTextOptions {
  maxBytes?: number;
  timeoutMs?: number;
  /** Only these Content-Type prefixes are accepted. */
  allowedContentTypes?: readonly string[];
}

/**
 * Fetches a user-supplied URL and returns its body as text, following
 * redirects manually so each hop is re-validated, and capping the body size.
 */
export async function safeFetchText(
  raw: string,
  options: SafeFetchTextOptions = {}
): Promise<string> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowedContentTypes = options.allowedContentTypes ?? ['text/', 'application/json'];

  let target = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertSafeUrl(target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new UnsafeUrlError('Redirect without a Location header');
      target = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      throw new UnsafeUrlError(`Upstream returned ${response.status}`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!allowedContentTypes.some((prefix) => contentType.startsWith(prefix))) {
      throw new UnsafeUrlError(
        `Unsupported content type "${contentType || 'unknown'}" -- expected a text document`
      );
    }

    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new UnsafeUrlError('Remote document exceeds the size limit');
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new UnsafeUrlError('Remote document exceeds the size limit');
    }
    return Buffer.from(buffer).toString('utf-8');
  }

  throw new UnsafeUrlError('Too many redirects');
}

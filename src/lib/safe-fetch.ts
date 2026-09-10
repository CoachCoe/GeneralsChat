import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Guarded outbound fetch for user-supplied URLs.
 *
 * Without this, `fetch(formData.get('url'))` is a read-anything-the-server-
 * can-reach oracle: cloud metadata endpoints (169.254.169.254), internal
 * services, and localhost are all reachable, and the response body was
 * stored where it could be read back out.
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
  // IPv4-mapped addresses must be judged as IPv4. Both notations, because
  // both parse: `::ffff:127.0.0.1` and `::ffff:7f00:1` are the same address,
  // and only the dotted-quad form was matched here -- so
  // `https://[::ffff:7f00:1]/` reached loopback and `[::ffff:a9fe:a9fe]`
  // reached the cloud metadata endpoint straight through the blocklist.
  const dotted = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isBlockedIPv4(dotted[1]);

  const hex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return isBlockedIPv4(
      `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`
    );
  }

  // IPv4-compatible (deprecated, but still routed by some stacks): ::a.b.c.d
  // and its hex equivalent ::7f00:1.
  const compatDotted = addr.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (compatDotted) return isBlockedIPv4(compatDotted[1]);

  // NAT64 well-known prefix, which translates to an arbitrary IPv4 address a
  // resolver cannot be asked about. Refused outright rather than decoded.
  if (addr.startsWith('64:ff9b:')) return true;

  return false;
}

/**
 * Exported for test only. The blocklist is the whole of this module's security
 * value and it had no unit test, which is how the IPv4-mapped hex notation
 * went unnoticed.
 */
export function isBlockedAddress(ip: string): boolean {
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
 * recommended in the audit is the stronger control.
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

    return await readCapped(response, maxBytes);
  }

  throw new UnsafeUrlError('Too many redirects');
}

/**
 * Read the body, stopping at the limit rather than measuring afterwards.
 *
 * `content-length` is the remote's claim and may be absent or a lie, so the
 * cap has to hold while reading: buffering first and checking the length
 * after means the memory the limit exists to bound is already spent.
 */
export async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) return '';

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new UnsafeUrlError('Remote document exceeds the size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks).toString('utf-8');
}

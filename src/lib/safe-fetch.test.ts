import { describe, expect, it } from 'vitest';
import { isBlockedAddress, readCapped, UnsafeUrlError } from './safe-fetch';

/**
 * The SSRF blocklist.
 *
 * This module's entire security value is this predicate, and it had no test --
 * which is how `::ffff:7f00:1` went unnoticed. That is the same address as
 * `::ffff:127.0.0.1`, written in the hex notation the IPv6 parser also accepts,
 * and only the dotted-quad form was matched. `https://[::ffff:a9fe:a9fe]/`
 * reached the cloud metadata endpoint.
 *
 * The DNS-rebinding gap is a separate, knowingly-open finding: this
 * covers the address predicate, not the resolve-then-connect window.
 */
describe('isBlockedAddress', () => {
  it('blocks IPv4 loopback, private and link-local ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '127.1.2.3',
      '0.0.0.0',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '192.0.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('allows an ordinary public IPv4 address', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '171.255.255.255']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it('blocks IPv6 loopback, link-local, unique-local and multicast', () => {
    for (const ip of ['::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('blocks IPv4-mapped IPv6 in dotted-quad notation', () => {
    for (const ip of ['::ffff:127.0.0.1', '::ffff:169.254.169.254', '::ffff:10.0.0.1']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('blocks IPv4-mapped IPv6 in hex notation -- the same addresses, written the other way', () => {
    // ::ffff:7f00:1     = 127.0.0.1
    // ::ffff:a9fe:a9fe  = 169.254.169.254, the cloud metadata endpoint
    // ::ffff:a00:1      = 10.0.0.1
    // ::ffff:ac10:1     = 172.16.0.1
    for (const ip of ['::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:a00:1', '::ffff:ac10:1']) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('blocks the deprecated IPv4-compatible form', () => {
    expect(isBlockedAddress('::127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::169.254.169.254')).toBe(true);
  });

  it('blocks the NAT64 well-known prefix, which can translate to anything', () => {
    expect(isBlockedAddress('64:ff9b::7f00:1')).toBe(true);
    expect(isBlockedAddress('64:ff9b::a9fe:a9fe')).toBe(true);
  });

  it('allows a public IPv4-mapped address in either notation', () => {
    // 8.8.8.8 = ::ffff:808:808
    expect(isBlockedAddress('::ffff:8.8.8.8')).toBe(false);
    expect(isBlockedAddress('::ffff:808:808')).toBe(false);
  });

  it('blocks anything that is not an IP address at all', () => {
    // A hostname reaching this function means resolution produced something
    // unexpected; refuse rather than guess.
    for (const value of ['', 'localhost', 'example.com', 'not-an-ip', '999.1.1.1']) {
      expect(isBlockedAddress(value), value).toBe(true);
    }
  });

  it('ignores a zone index, which cannot be used to smuggle a different address', () => {
    expect(isBlockedAddress('fe80::1%eth0')).toBe(true);
  });
});

/**
 * The size cap has to hold while reading. Buffering the body and measuring it
 * afterwards spends exactly the memory the limit exists to bound, and
 * `content-length` is the remote's claim -- absent, or a lie.
 */
describe('readCapped', () => {
  const streamed = (chunks: string[], headers?: HeadersInit) =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
          controller.close();
        },
      }),
      { headers }
    );

  it('returns a body within the limit', async () => {
    await expect(readCapped(streamed(['hello ', 'world']), 64)).resolves.toBe('hello world');
  });

  it('rejects a body that grows past the limit, whatever it declared', async () => {
    const response = streamed(['0123456789', '0123456789'], { 'content-length': '2' });
    await expect(readCapped(response, 12)).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('stops reading rather than draining the rest of the stream', async () => {
    let enqueued = 0;
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          enqueued += 1;
          controller.enqueue(new TextEncoder().encode('x'.repeat(1024)));
          if (enqueued > 64) controller.close();
        },
      })
    );

    await expect(readCapped(response, 2048)).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(enqueued).toBeLessThan(8);
  });

  it('treats a bodiless response as empty', async () => {
    await expect(readCapped(new Response(null, { status: 204 }), 16)).resolves.toBe('');
  });
});

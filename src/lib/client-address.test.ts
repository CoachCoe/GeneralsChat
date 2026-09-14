import { describe, expect, it } from 'vitest';
import { clientAddress, trustedHops, UNKNOWN, UNTRUSTED } from './client-address';

const header = (forwardedFor: string | null, realIp: string | null = null) => ({
  forwardedFor,
  realIp,
});

describe('trustedHops', () => {
  it('defaults to one, which is Container Apps and plain Cloud Run', () => {
    expect(trustedHops(undefined)).toBe(1);
    expect(trustedHops('')).toBe(1);
  });

  it('honours a positive integer', () => {
    expect(trustedHops('2')).toBe(2);
  });

  it('falls back rather than honouring a value that would trust the client', () => {
    // A mistyped setting must not become "read the leftmost entry".
    for (const bad of ['0', '-1', '1.5', 'two', 'Infinity']) {
      expect(trustedHops(bad), bad).toBe(1);
    }
  });
});

describe('clientAddress', () => {
  it('reads the entry the platform appended, not the one the client sent', () => {
    // The attack: a client sends its own x-forwarded-for and the proxy appends
    // to it. The leftmost entry is attacker-chosen; the rightmost is not.
    expect(clientAddress(header('1.1.1.1, 203.0.113.9'), 1)).toBe('203.0.113.9');
  });

  it('gives an attacker no way to rotate the key', () => {
    const spoofed = ['9.9.9.9', '8.8.8.8', 'not-an-ip'].map(fake =>
      clientAddress(header(`${fake}, 203.0.113.9`), 1)
    );
    // Every request lands in the same bucket however the client labels itself.
    expect(new Set(spoofed).size).toBe(1);
  });

  it('counts further in when the platform appends more than one', () => {
    expect(clientAddress(header('1.1.1.1, 203.0.113.9, 10.0.0.1'), 2)).toBe('203.0.113.9');
  });

  it('shares one bucket when the header is shorter than the trusted hops', () => {
    // The request did not come through the proxy we think it did, so it does
    // not get to name itself.
    expect(clientAddress(header('1.1.1.1'), 2)).toBe(UNTRUSTED);
    expect(clientAddress(header('1.1.1.1, 2.2.2.2'), 3)).toBe(UNTRUSTED);
  });

  it('ignores padding and empty entries rather than counting them as hops', () => {
    expect(clientAddress(header(' 1.1.1.1 ,  , 203.0.113.9 '), 1)).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip, then to one shared bucket', () => {
    expect(clientAddress(header(null, '203.0.113.9'), 1)).toBe('203.0.113.9');
    expect(clientAddress(header(null, null), 1)).toBe(UNKNOWN);
  });
});

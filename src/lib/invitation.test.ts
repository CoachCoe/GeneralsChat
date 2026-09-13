import { describe, expect, it } from 'vitest';
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationLink,
  INVITATION_TTL_DAYS,
} from './invitation';

describe('invitation tokens', () => {
  it('are long and unguessable', () => {
    const token = generateInvitationToken();
    // 32 bytes of base64url. Short enough to paste, long enough that guessing
    // is not a strategy.
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, generateInvitationToken));
    expect(seen.size).toBe(200);
  });

  it('hash deterministically, and the hash is not the token', () => {
    const token = generateInvitationToken();
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
    expect(hashInvitationToken(token)).not.toBe(token);
    expect(hashInvitationToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('separate different tokens', () => {
    expect(hashInvitationToken('a')).not.toBe(hashInvitationToken('b'));
  });
});

describe('invitationExpiry', () => {
  it('is the stated window from the moment it is issued', () => {
    const now = new Date('2026-09-13T12:00:00Z');
    expect(invitationExpiry(now).toISOString()).toBe('2026-09-20T12:00:00.000Z');
    expect(INVITATION_TTL_DAYS).toBe(7);
  });
});

describe('invitationLink', () => {
  it('is absolute, because it is pasted somewhere else', () => {
    expect(invitationLink('https://app.example.org', 'abc')).toBe(
      'https://app.example.org/invite/abc'
    );
  });

  it('does not double the slash when the origin carries one', () => {
    expect(invitationLink('https://app.example.org/', 'abc')).toBe(
      'https://app.example.org/invite/abc'
    );
  });
});

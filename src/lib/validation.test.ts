import { describe, expect, it } from 'vitest';
import {
  chatMessageSchema,
  createIncidentSchema,
  paginationSchema,
  updateIncidentSchema,
  MAX_PAGE_SIZE,
} from './validation';

describe('paginationSchema', () => {
  it('clamps an oversized limit instead of rejecting it', () => {
    // Rejecting a well-formed but large limit would 400 a reasonable client;
    // returning the whole table would be the SEC-12 exfiltration path.
    const r = paginationSchema.parse({ limit: '1000000' });
    expect(r.limit).toBe(MAX_PAGE_SIZE);
  });

  it('rejects a non-numeric limit rather than passing NaN to the database', () => {
    // `take: NaN` reached Prisma and produced an unhandled 500.
    expect(paginationSchema.safeParse({ limit: 'abc' }).success).toBe(false);
  });

  it('rejects zero and negative values', () => {
    expect(paginationSchema.safeParse({ page: '0' }).success).toBe(false);
    expect(paginationSchema.safeParse({ limit: '-5' }).success).toBe(false);
  });

  it('rejects a fractional page', () => {
    expect(paginationSchema.safeParse({ page: '1.5' }).success).toBe(false);
  });

  it('defaults when nothing is supplied', () => {
    const r = paginationSchema.parse({});
    expect(r.page).toBe(1);
    expect(r.limit).toBe(10);
  });
});

describe('chatMessageSchema', () => {
  it('accepts a null incidentId', () => {
    // The chat page holds incidentId in state initialised to null and
    // JSON.stringify emits it, so `.optional()` alone 400'd the first message
    // of every new conversation.
    expect(chatMessageSchema.safeParse({ message: 'hi', incidentId: null }).success).toBe(true);
  });

  it('accepts an omitted incidentId', () => {
    expect(chatMessageSchema.safeParse({ message: 'hi' }).success).toBe(true);
  });

  it('rejects an empty incidentId string, which is never a real id', () => {
    expect(chatMessageSchema.safeParse({ message: 'hi', incidentId: '' }).success).toBe(false);
  });

  it('rejects an empty message', () => {
    expect(chatMessageSchema.safeParse({ message: '' }).success).toBe(false);
  });

  it('enforces the message length ceiling at the boundary', () => {
    expect(chatMessageSchema.safeParse({ message: 'a'.repeat(5000) }).success).toBe(true);
    expect(chatMessageSchema.safeParse({ message: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('ignores a client-supplied userId', () => {
    // Identity comes from the session. A userId in the body must not become
    // part of the parsed data.
    const r = chatMessageSchema.parse({ message: 'hi', userId: 'someone-else' });
    expect(r).not.toHaveProperty('userId');
  });
});

describe('incident schemas', () => {
  it('rejects a status outside the vocabulary', () => {
    // `status: "banana"` was persisted, stranding the incident off every list.
    expect(updateIncidentSchema.safeParse({ status: 'banana' }).success).toBe(false);
  });

  it('accepts the statuses the schema documents', () => {
    for (const status of ['open', 'in_progress', 'under_review', 'completed', 'closed']) {
      expect(updateIncidentSchema.safeParse({ status }).success, status).toBe(true);
    }
  });

  it('rejects an unknown incident type and severity', () => {
    expect(createIncidentSchema.safeParse({
      title: 't', description: 'd', incidentType: 'nonsense',
    }).success).toBe(false);
    expect(createIncidentSchema.safeParse({
      title: 't', description: 'd', severity: 'catastrophic',
    }).success).toBe(false);
  });

  it('accepts `substance`, which the classifier can return', () => {
    // The type union omitted it, papered over with `as any` at the call site.
    expect(createIncidentSchema.safeParse({
      title: 't', description: 'd', incidentType: 'substance',
    }).success).toBe(true);
  });

  it('does not accept a caller-supplied reporterId', () => {
    const r = createIncidentSchema.parse({ title: 't', description: 'd', reporterId: 'x' });
    expect(r).not.toHaveProperty('reporterId');
  });
});

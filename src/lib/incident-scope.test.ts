import { describe, expect, it } from 'vitest';
import { canReadAllIncidents, incidentReadScope, incidentScope } from './incident-scope';

const reporter = { id: 'r1', role: 'reporter' };
const investigator = { id: 'i1', role: 'investigator' };
const admin = { id: 'a1', role: 'admin' };

describe('canReadAllIncidents', () => {
  it('is staff only, and an unknown role is not staff', () => {
    expect(canReadAllIncidents(admin)).toBe(true);
    expect(canReadAllIncidents(investigator)).toBe(true);
    expect(canReadAllIncidents(reporter)).toBe(false);
    // A role nobody has defined must not fall open.
    expect(canReadAllIncidents({ id: 'x', role: 'principal' })).toBe(false);
    expect(canReadAllIncidents({ id: 'x', role: '' })).toBe(false);
  });
});

describe('incidentScope — who may change an incident', () => {
  it('confines a reporter to what they filed', () => {
    expect(incidentScope(reporter)).toEqual({ reporterId: 'r1' });
  });

  it('does not widen for a share', () => {
    // The property the whole design rests on: a recipient reads and writes
    // nothing. If this ever grows an OR, every write path silently grants it.
    expect(JSON.stringify(incidentScope(reporter))).not.toContain('shares');
  });

  it('is unconstrained for staff', () => {
    expect(incidentScope(admin)).toEqual({});
    expect(incidentScope(investigator)).toEqual({});
  });
});

describe('incidentReadScope — who may read an incident', () => {
  it('admits what a reporter filed and what was shared with them', () => {
    expect(incidentReadScope(reporter)).toEqual({
      OR: [{ reporterId: 'r1' }, { shares: { some: { userId: 'r1' } } }],
    });
  });

  it('matches the share by recipient, never by incident alone', () => {
    // `shares: { some: {} }` would admit every incident that has ever been
    // shared with anyone.
    const scope = incidentReadScope(reporter);
    const share = (scope.OR as { shares?: { some: { userId: string } } }[])[1];
    expect(share.shares?.some.userId).toBe('r1');
  });

  it('is unconstrained for staff, who already read everything', () => {
    expect(incidentReadScope(admin)).toEqual({});
    expect(incidentReadScope(investigator)).toEqual({});
  });

  it('never returns an empty fragment for a reporter', () => {
    // An empty `where` is "every incident". A reporter must never produce one,
    // whatever their id looks like.
    for (const id of ['', 'r1', '0']) {
      expect(Object.keys(incidentReadScope({ id, role: 'reporter' }))).toEqual(['OR']);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  ALWAYS_RETRIEVED_CATEGORY,
  categoriesForIncidentType,
  guaranteedCategoriesFor,
  INCIDENT_TYPES,
  POLICY_CATEGORIES,
} from './index';

/**
 * This mapping decides which policies an incident retrieves. Get it wrong and
 * an administrator is either shown policy that does not apply, or not shown
 * policy that does.
 */
describe('categoriesForIncidentType', () => {
  it('always includes mandatory reporting for a classified incident', () => {
    // "Must I report this, to whom, by when" is the question the tool exists
    // to answer, and that policy shares almost no vocabulary with how an
    // incident gets described — so relevance alone would never surface it.
    for (const type of INCIDENT_TYPES) {
      const categories = categoriesForIncidentType(type);
      if (categories.length === 0) continue; // `other` constrains nothing
      expect(categories, type).toContain(ALWAYS_RETRIEVED_CATEGORY);
    }
  });

  it('returns no categories for an unclassified incident, so retrieval is unfiltered', () => {
    // Narrowing to mandatory_reporting alone would exclude every other policy
    // on any turn where classification has not run — which is the opening turn.
    expect(categoriesForIncidentType(null)).toEqual([]);
    expect(categoriesForIncidentType(undefined)).toEqual([]);
    expect(categoriesForIncidentType('not-a-type')).toEqual([]);
  });

  it('leaves retrieval unfiltered for `other`, which implicates nothing specific', () => {
    expect(categoriesForIncidentType('other')).toEqual([]);
  });

  it('maps each incident type only to categories that exist', () => {
    for (const type of INCIDENT_TYPES) {
      for (const category of categoriesForIncidentType(type)) {
        expect(POLICY_CATEGORIES, `${type} -> ${category}`).toContain(category);
      }
    }
  });

  it('returns no duplicates', () => {
    for (const type of INCIDENT_TYPES) {
      const c = categoriesForIncidentType(type);
      expect(new Set(c).size, type).toBe(c.length);
    }
  });

  it('maps bullying to bullying and discipline', () => {
    expect(categoriesForIncidentType('bullying')).toEqual(
      expect.arrayContaining(['bullying', 'discipline'])
    );
  });

  it('maps title_ix to title_ix and discrimination', () => {
    expect(categoriesForIncidentType('title_ix')).toEqual(
      expect.arrayContaining(['title_ix', 'discrimination'])
    );
  });
});

describe('guaranteedCategoriesFor', () => {
  // The search filter and the guaranteed set were once the same function, and
  // an `other` incident -- the classifier's own failure default -- therefore
  // retrieved no mandatory-reporting policy AND had its coverage assessment
  // skipped, so every gap warning was suppressed at the same time. These two
  // callers must never collapse back into one. (B3)

  it('always includes mandatory reporting, whatever the classification', () => {
    for (const type of [...INCIDENT_TYPES, 'other']) {
      expect(guaranteedCategoriesFor(type)).toContain(ALWAYS_RETRIEVED_CATEGORY);
    }
  });

  it('includes mandatory reporting for an unclassified incident', () => {
    expect(guaranteedCategoriesFor(null)).toEqual([ALWAYS_RETRIEVED_CATEGORY]);
    expect(guaranteedCategoriesFor(undefined)).toEqual([ALWAYS_RETRIEVED_CATEGORY]);
    expect(guaranteedCategoriesFor('not-a-type')).toEqual([ALWAYS_RETRIEVED_CATEGORY]);
  });

  it('includes mandatory reporting for `other`, where the search filter is empty', () => {
    // The empty filter is deliberate: narrowing an unclassified incident to one
    // category would exclude every other policy. The guarantee is not.
    expect(categoriesForIncidentType('other')).toEqual([]);
    expect(guaranteedCategoriesFor('other')).toEqual([ALWAYS_RETRIEVED_CATEGORY]);
  });

  it('is a superset of the search filter, without duplicates', () => {
    for (const type of INCIDENT_TYPES) {
      const filter = categoriesForIncidentType(type);
      const guaranteed = guaranteedCategoriesFor(type);
      for (const c of filter) expect(guaranteed).toContain(c);
      expect(new Set(guaranteed).size).toBe(guaranteed.length);
    }
  });
});

describe('abuse and neglect', () => {
  // The taxonomy had no value for this, so a disclosure about a child's home
  // life classified as `other` -- the highest-stakes report this tool handles,
  // on the shortest clock, in the bucket that means "we could not tell". (OQ-3)

  it('is a first-class incident type', () => {
    expect(INCIDENT_TYPES).toContain('abuse_neglect');
  });

  it('retrieves mandatory reporting, and is not diluted with unrelated categories', () => {
    // Report to whom, by when, is the whole question here.
    expect(categoriesForIncidentType('abuse_neglect')).toEqual(['mandatory_reporting']);
  });

  it('constrains the search rather than falling through to no filter', () => {
    // `other` returns [] which callers treat as "no filter", so a keyword hit
    // from any unrelated policy could be handed to the model as authority.
    expect(categoriesForIncidentType('abuse_neglect')).not.toEqual([]);
  });
});

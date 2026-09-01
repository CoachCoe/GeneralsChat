import {
  ALWAYS_RETRIEVED_CATEGORY,
  categoriesForIncidentType,
  INCIDENT_TYPES,
  LOCAL_JURISDICTIONS,
  POLICY_CATEGORIES,
  POLICY_JURISDICTIONS,
  type IncidentType,
} from '@/types';

/**
 * What the policy library can and cannot answer.
 *
 * Derived from the same functions retrieval uses -- `categoriesForIncidentType`
 * and the jurisdiction/category vocabularies -- so the report cannot drift away
 * from what the system actually does. A coverage report that disagrees with
 * retrieval is worse than none.
 */

export interface PolicyRow {
  title: string;
  jurisdiction: string;
  category: string;
  isActive: boolean;
  chunkCount: number;
  embeddedChunkCount: number;
  contentLength: number;
}

export interface CategoryCoverage {
  category: string;
  /** Jurisdictions with at least one active, retrievable policy. */
  jurisdictions: string[];
  hasLocal: boolean;
  hasAny: boolean;
  policyCount: number;
  chunkCount: number;
}

export interface IncidentTypeCoverage {
  incidentType: IncidentType;
  /** Categories this incident type implicates, excluding the always-retrieved one. */
  subjectCategories: string[];
  /** Subject categories with no district or school policy. */
  subjectGaps: string[];
  /** True when nothing the incident is about has a local policy. */
  outsideLibrary: boolean;
  /** Whether mandatory reporting itself is locally covered. */
  mandatoryReportingLocal: boolean;
}

export interface LibraryProblem {
  kind: 'unretrievable' | 'inactive' | 'no-embeddings';
  title: string;
  detail: string;
}

export interface CoverageReport {
  categories: CategoryCoverage[];
  incidentTypes: IncidentTypeCoverage[];
  problems: LibraryProblem[];
  totals: {
    activePolicies: number;
    activeChunks: number;
    embeddedChunks: number;
    categoriesWithLocal: number;
    categoriesWithAny: number;
  };
}

/**
 * A policy only counts as covering something if it is active AND has chunks.
 * A policy row with no chunks is invisible to retrieval, so counting it would
 * report coverage the system cannot actually deliver.
 */
function isRetrievable(p: PolicyRow): boolean {
  return p.isActive && p.chunkCount > 0;
}

export function buildCoverageReport(policies: PolicyRow[]): CoverageReport {
  const categories: CategoryCoverage[] = POLICY_CATEGORIES.map(category => {
    const inCategory = policies.filter(p => p.category === category && isRetrievable(p));
    const jurisdictions = POLICY_JURISDICTIONS.filter(j =>
      inCategory.some(p => p.jurisdiction === j)
    );
    return {
      category,
      jurisdictions,
      hasLocal: jurisdictions.some(j => LOCAL_JURISDICTIONS.includes(j)),
      hasAny: jurisdictions.length > 0,
      policyCount: inCategory.length,
      chunkCount: inCategory.reduce((n, p) => n + p.chunkCount, 0),
    };
  });

  const byCategory = new Map(categories.map(c => [c.category, c]));
  const mandatoryReportingLocal = byCategory.get(ALWAYS_RETRIEVED_CATEGORY)?.hasLocal ?? false;

  const incidentTypes: IncidentTypeCoverage[] = INCIDENT_TYPES.map(incidentType => {
    const implicated = categoriesForIncidentType(incidentType);
    const subjectCategories = implicated.filter(c => c !== ALWAYS_RETRIEVED_CATEGORY);
    const subjectGaps = subjectCategories.filter(c => !byCategory.get(c)?.hasLocal);
    return {
      incidentType,
      subjectCategories,
      subjectGaps,
      // `other` implicates nothing specific, so it is never "outside" anything.
      outsideLibrary: subjectCategories.length > 0 && subjectGaps.length === subjectCategories.length,
      mandatoryReportingLocal,
    };
  });

  const problems: LibraryProblem[] = [];
  for (const p of policies) {
    if (p.isActive && p.chunkCount === 0) {
      problems.push({
        kind: 'unretrievable',
        title: p.title,
        detail:
          p.contentLength > 0
            ? `active with ${p.contentLength} chars of content but no chunks — invisible to retrieval; re-index it`
            : 'active but has no content and no chunks — the source document never parsed',
      });
    }
    if (!p.isActive) {
      problems.push({ kind: 'inactive', title: p.title, detail: 'inactive — excluded from retrieval' });
    }
    if (p.isActive && p.chunkCount > 0 && p.embeddedChunkCount === 0) {
      problems.push({
        kind: 'no-embeddings',
        title: p.title,
        detail: 'no embeddings — retrievable only by keyword match',
      });
    }
  }

  const active = policies.filter(isRetrievable);
  return {
    categories,
    incidentTypes,
    problems,
    totals: {
      activePolicies: active.length,
      activeChunks: active.reduce((n, p) => n + p.chunkCount, 0),
      embeddedChunks: active.reduce((n, p) => n + p.embeddedChunkCount, 0),
      categoriesWithLocal: categories.filter(c => c.hasLocal).length,
      categoriesWithAny: categories.filter(c => c.hasAny).length,
    },
  };
}

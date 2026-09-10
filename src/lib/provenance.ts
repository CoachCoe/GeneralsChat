import { ALWAYS_RETRIEVED_CATEGORY } from '@/types';
import type { TurnKind } from '@/lib/ai/turn-label';

export interface ProvenanceSource {
  jurisdiction: string;
  title: string;
  /** Provisions relied on, when the document had parseable structure. */
  sections?: string[];
}

export interface CoverageSummary {
  categories: string[];
  categoriesWithoutLocalPolicy: string[];
}

export interface ProvenanceTurn {
  type: string;
  kind?: TurnKind;
  citations?: ProvenanceSource[];
  coverage?: CoverageSummary;
}

export interface ConversationProvenance {
  /** Deduplicated, in the order first relied on. */
  sources: ProvenanceSource[];
  gapCategories: string[];
  subjectOutsideLibrary: boolean;
}

/**
 * True when nothing the incident is actually *about* has a local policy.
 *
 * mandatory_reporting is appended to every incident and is nearly always
 * covered locally, so it has to be excluded — otherwise this is never true and
 * the scope note never appears.
 */
function isSubjectOutsideLibrary(coverage: CoverageSummary): boolean {
  const subject = coverage.categories.filter(c => c !== ALWAYS_RETRIEVED_CATEGORY);
  if (subject.length === 0) return false;
  return subject.every(c => coverage.categoriesWithoutLocalPolicy.includes(c));
}

/**
 * What the conversation rests on, for the rail beside it.
 *
 * Kept out of the component because it is the part that can be wrong and the
 * page is out of reach of both gates: vitest runs in `node`, and no e2e
 * fixture can produce a turn with zero citations.
 *
 * A turn that only asks a clarifying question retrieved policy it never used,
 * so it contributes nothing. Gated on `=== 'question'` rather than
 * `!== 'guidance'`: an unlabelled or unreadable turn still contributes.
 */
export function conversationProvenance(turns: ProvenanceTurn[]): ConversationProvenance | null {
  const answers = turns.filter(turn => turn.type === 'general' && turn.kind !== 'question');

  const sources: ProvenanceSource[] = [];
  for (const citation of answers.flatMap(turn => turn.citations ?? [])) {
    const seen = sources.find(
      s => s.jurisdiction === citation.jurisdiction && s.title === citation.title
    );
    if (!seen) {
      sources.push({ ...citation, sections: [...(citation.sections ?? [])] });
      continue;
    }
    // A later answer may lean on a further provision of a policy already
    // cited. Dropping it understates what the guidance rests on.
    for (const section of citation.sections ?? []) {
      if (!seen.sections?.includes(section)) seen.sections?.push(section);
    }
  }

  // Coverage describes the incident, not the turn, and classification is
  // refined as the administrator says more -- so the latest reading speaks
  // and earlier ones do not accumulate into warnings about an incident this
  // no longer is.
  const coverage = answers.filter(turn => turn.coverage).pop()?.coverage;
  const gapCategories = coverage?.categoriesWithoutLocalPolicy ?? [];

  if (sources.length === 0 && gapCategories.length === 0) return null;

  return {
    sources,
    gapCategories,
    subjectOutsideLibrary: coverage ? isSubjectOutsideLibrary(coverage) : false,
  };
}

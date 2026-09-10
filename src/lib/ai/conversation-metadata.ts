import { z } from 'zod';
import type { PolicyCitation } from '@/types';
import type { TurnKind } from './turn-label';

/**
 * What a stored assistant turn can tell us about itself.
 *
 * `Conversation.metadata` is a JSON string written by POST /api/chat. It has
 * accumulated fields over time and older rows predate most of them, so this
 * reads the few the chat view needs and ignores the rest rather than
 * describing the whole record.
 *
 * The reason it is read at all: without it the history route carries only id,
 * type, content and timestamp, so reloading an incident drops every citation
 * the guidance rested on and provenance lives no longer than the tab -- on a
 * tool whose answers are meant to be checked.
 */
const citationSchema = z.object({
  policyId: z.string(),
  title: z.string(),
  jurisdiction: z.string(),
  category: z.string(),
  sections: z.array(z.string()).optional(),
});

// `.catch` per field, so the two are read independently: a citations array we
// cannot make sense of must not also cost us the turn's kind, and an
// unrecognised kind must not cost the administrator the citations.
const storedTurnSchema = z.object({
  citations: z.array(citationSchema).optional().catch(undefined),
  kind: z.enum(['question', 'guidance']).optional().catch(undefined),
});

export interface StoredTurn {
  /**
   * The policies the turn was answered from, as recorded at the time.
   *
   * Undefined and empty mean different things and both are preserved: undefined
   * is a turn that recorded nothing, which renders no provenance at all, while
   * an empty array is a turn where retrieval ran and matched nothing, which
   * renders the "no policy text was retrieved, at any level" caution. Collapsing
   * them would turn a stated absence into silence.
   */
  citations?: PolicyCitation[];
  kind?: TurnKind;
}

/**
 * Read the fields the chat view needs out of a stored turn.
 *
 * Never throws. A row whose metadata is absent, truncated, not JSON, or JSON
 * of an unrecognised shape yields an empty result, and the turn renders as one
 * with nothing recorded -- which is what it is. A conversation must still load
 * when one turn in the middle of it cannot be read; the alternative is an
 * administrator locked out of the whole incident record by a bad row.
 */
export function readStoredTurn(raw: string | null | undefined): StoredTurn {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  const result = storedTurnSchema.safeParse(parsed);
  if (!result.success) return {};

  return { citations: result.data.citations, kind: result.data.kind };
}

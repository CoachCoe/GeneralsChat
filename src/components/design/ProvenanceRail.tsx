import { SourceLadder } from '@/components/design/SourceLadder';
import { LibraryScopeNote } from '@/components/design/LibraryScopeNote';
import { ALWAYS_RETRIEVED_CATEGORY } from '@/types';
import type { ConversationProvenance } from '@/lib/provenance';

/**
 * What the conversation rests on, beside the transcript rather than inside it.
 *
 * The rail is on screen throughout, so a coverage gap is reported on every
 * guidance turn by being here: the dashed local rung, labelled `gap`, is that
 * report.
 */
export function ProvenanceRail({
  provenance,
  incidentType,
}: {
  provenance: ConversationProvenance;
  incidentType?: string | null;
}) {
  return (
    <div data-testid="chat-sources" className="flex flex-col gap-4 px-5 py-6">
      {/* The note and the dashed rungs report the same absence, so only one
          of them speaks: the note names what the system thinks the incident
          is and says what to do, which the rungs cannot. */}
      <SourceLadder
        sources={provenance.sources}
        gapCategories={provenance.subjectOutsideLibrary ? [] : provenance.gapCategories}
      />

      {provenance.subjectOutsideLibrary && (
        <LibraryScopeNote
          incidentType={incidentType}
          categories={provenance.gapCategories.filter(c => c !== ALWAYS_RETRIEVED_CATEGORY)}
        />
      )}
    </div>
  );
}

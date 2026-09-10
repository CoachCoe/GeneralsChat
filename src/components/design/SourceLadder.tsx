import {
  POLICY_JURISDICTIONS,
  LOCAL_JURISDICTIONS,
  JURISDICTION_LABELS,
  CATEGORY_LABELS,
} from '@/types';

export interface SourceRung {
  jurisdiction: string;
  title: string;
  note?: string;
  /** Provisions relied on, e.g. "JICK §F — Investigative Procedures (RSA …)". */
  sections?: string[];
}

/**
 * What the guidance rests on, highest authority first.
 *
 * Each rung is indented one step further than the one above, so the
 * federal -> state -> district -> school hierarchy is literal rather than
 * implied -- and an empty rung is drawn dashed and labelled, because a missing
 * local policy is information, not an absence to hide. (design 1c + 1d ladder)
 */
const INDENT = ['ml-0', 'ml-2', 'ml-4', 'ml-6'];

const TONE: Record<string, { label: string; title: string; dot: string }> = {
  federal: { label: 'text-text', title: 'text-text-secondary', dot: 'bg-text' },
  state: { label: 'text-text-secondary', title: 'text-text-secondary', dot: 'bg-text-secondary' },
  district: { label: 'text-text-tertiary', title: 'text-text-secondary', dot: 'bg-text-tertiary' },
  school: { label: 'text-text-muted', title: 'text-text-tertiary', dot: 'bg-line-strong' },
};

export function SourceLadder({
  sources,
  gapCategories = [],
}: {
  sources: SourceRung[];
  /** Categories with no local policy, used to label the empty rungs. */
  gapCategories?: string[];
}) {
  // Group rather than collapse: one jurisdiction routinely holds several
  // relevant policies -- a district will have both a bullying policy and a
  // mandatory-reporting policy on the same incident -- and showing only one
  // would silently drop authority the guidance actually rests on.
  const byJurisdiction = new Map<string, SourceRung[]>();
  for (const source of sources) {
    const existing = byJurisdiction.get(source.jurisdiction) ?? [];
    if (!existing.some(e => e.title === source.title)) existing.push(source);
    byJurisdiction.set(source.jurisdiction, existing);
  }

  const hasLocalGap = gapCategories.length > 0;
  // District and school with nothing on file are one fact, not two.
  const localEmpty = POLICY_JURISDICTIONS.filter(
    j => LOCAL_JURISDICTIONS.includes(j) && !byJurisdiction.has(j)
  );
  const collapseLocal = hasLocalGap && localEmpty.length === LOCAL_JURISDICTIONS.length;

  return (
    <div className="flex flex-col gap-2">
      {POLICY_JURISDICTIONS.map((jurisdiction, i) => {
        const rungs = byJurisdiction.get(jurisdiction) ?? [];
        const tone = TONE[jurisdiction];
        const isLocal = LOCAL_JURISDICTIONS.includes(jurisdiction);
        // Only draw an empty local rung when there is actually a gap to report.
        if (rungs.length === 0 && !(isLocal && hasLocalGap)) return null;
        // Drawn once, at the dimmest level it covers.
        if (collapseLocal && isLocal && jurisdiction !== localEmpty[localEmpty.length - 1]) {
          return null;
        }

        return (
          <div
            key={jurisdiction}
            className={`flex flex-col gap-2 rounded-[12px] border bg-surface px-[14px] py-3 ${INDENT[i]} ${
              rungs.length > 0 ? 'border-line' : 'border-dashed border-line-strong'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 flex-none rounded-full ${
                  rungs.length > 0 ? tone.dot : 'bg-line-strong'
                }`}
                aria-hidden
              />
              <span
                className={`flex-1 text-[10px] font-medium uppercase leading-none tracking-[0.1em] ${tone.label}`}
              >
                {collapseLocal && isLocal
                  ? localEmpty.map(j => JURISDICTION_LABELS[j]).join(' & ')
                  : JURISDICTION_LABELS[jurisdiction]}
              </span>
              {rungs.length === 0 && (
                <span className="flex-none text-[11px] text-attention">gap</span>
              )}
            </div>

            {rungs.length > 0 ? (
              <div className="flex flex-1 flex-col gap-1">
                {rungs.map(rung => (
                  <div key={rung.title} className="flex flex-col gap-0.5">
                    <div className="flex items-baseline gap-3">
                      <span className={`flex-1 text-[14px] leading-[1.4] ${tone.title}`}>
                        {rung.title}
                      </span>
                      {rung.note && (
                        <span className="flex-none text-[12px] text-text-muted">{rung.note}</span>
                      )}
                    </div>
                    {/* The provisions actually relied on, so a reader can go
                        to the paragraph rather than the document. */}
                    {rung.sections && rung.sections.length > 0 && (
                      <ul className="mt-0.5 flex flex-col gap-0.5">
                        {rung.sections.map(section => (
                          <li
                            key={section}
                            className="text-[12px] leading-[1.45] text-text-muted"
                          >
                            {section}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-[14px] leading-[1.4] text-text-tertiary">
                {/* Labels, not slugs: "mandatory_reporting" is our schema. */}
                Nothing on file for{' '}
                {gapCategories.map(c => (CATEGORY_LABELS[c] ?? c).toLowerCase()).join(', ')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

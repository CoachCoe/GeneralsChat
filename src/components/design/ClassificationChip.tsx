import { INCIDENT_TYPE_LABELS, SEVERITIES } from '@/types';

/**
 * What the system decided this incident is.
 *
 * The first thing an administrator needs to see, because everything after it --
 * which policies apply, which clocks start -- follows from it. It was being
 * returned by the API and rendered nowhere. (design 1c)
 *
 * No confidence figure: the classifier does not produce one, and a fabricated
 * number next to a compliance determination is worse than no number.
 */
// No SEVERITY_TONE. It painted critical and high in `text-overdue` and medium
// in `text-attention` -- the deadline colours, spent on severity, which is the
// one thing `CLAUDE.md` names explicitly:
//
//   "Colour is earned. It means a deadline state -- overdue (red), attention
//    (amber), met (green) -- or a coverage gap (amber). Nothing else. No brand
//    accent, and never severity, error states or decoration: those would
//    compete with the only signal the UI is allowed to raise its voice with."
//
// A red "critical severity" beside an amber deadline is two urgent signals
// disagreeing about which one to act on. The label already reads
// "{severity} severity", which carries the meaning without the hue.
//
// `docs/roadmap.md` recorded this as fixed by the 2026-09-01 audit ("severity
// chips and error states lost their colour"). It was not; SPEC-44 is absent
// from that audit's own fix list. (SPEC-54, FLOW-62)

export function ClassificationChip({
  incidentType,
  severity,
}: {
  incidentType: string;
  severity?: string | null;
}) {
  const label =
    INCIDENT_TYPE_LABELS[incidentType as keyof typeof INCIDENT_TYPE_LABELS] ?? incidentType;
  const known = severity && (SEVERITIES as readonly string[]).includes(severity);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="eyebrow">Classified as</span>
      <span className="rounded-full border border-line-strong bg-input px-3 py-1.5 text-[13px] font-medium leading-none text-text">
        {label}
      </span>
      {known && (
        <span className="text-[12px] text-text-tertiary">{severity} severity</span>
      )}
    </div>
  );
}

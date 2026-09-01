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
const SEVERITY_TONE: Record<string, string> = {
  critical: 'text-overdue',
  high: 'text-overdue',
  medium: 'text-attention',
  low: 'text-text-tertiary',
};

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
        <span className={`text-[12px] ${SEVERITY_TONE[severity] ?? 'text-text-tertiary'}`}>
          {severity} severity
        </span>
      )}
    </div>
  );
}

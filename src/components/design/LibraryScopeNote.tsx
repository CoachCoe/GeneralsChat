import { CATEGORY_LABELS, INCIDENT_TYPE_LABELS } from '@/types';

/**
 * Shown when the policy library holds nothing local for *any* area this
 * incident implicates.
 *
 * Distinct from a coverage gap, which is a partial miss. This is the whole
 * subject being outside what the district has loaded, and the honest response
 * is to say so rather than answer from federal and state law as though it were
 * local procedure. During a pilot with a deliberately narrow library this is
 * the expected case for anything that is not the loaded subject, and saying so
 * is the feature -- an administrator who is told "no local policy is loaded for
 * this" knows to go and ask, whereas one given confident guidance does not.
 */
export function LibraryScopeNote({
  incidentType,
  categories,
}: {
  incidentType?: string | null;
  categories: string[];
}) {
  const typeLabel = incidentType
    ? (INCIDENT_TYPE_LABELS[incidentType as keyof typeof INCIDENT_TYPE_LABELS] ?? incidentType)
    : null;
  const named = categories.map(c => CATEGORY_LABELS[c] ?? c);

  return (
    <div
      role="note"
      className="flex flex-col gap-1.5 rounded-[16px] border border-attention/40 bg-attention/[0.07] px-5 py-[18px]"
    >
      <span className="text-[15px] font-medium leading-[1.3] text-text">
        {typeLabel
          ? `This reads as a ${typeLabel.toLowerCase()} matter, and no district or school policy is loaded for it.`
          : 'No district or school policy is loaded for this type of incident.'}
      </span>
      <span className="text-[14px] leading-[1.6] text-text-secondary">
        Nothing local was found for {named.join(', ').toLowerCase()}. Anything above rests on
        federal or state requirements, or on general practice — treat it as a starting point,
        confirm the district procedure with your compliance officer, and record that you did.
      </span>
    </div>
  );
}

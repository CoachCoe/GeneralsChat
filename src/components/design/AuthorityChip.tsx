import { JURISDICTION_LABELS, type PolicyJurisdiction } from '@/types';
import { authorityTone } from '@/lib/authority-tone';

/** Which level of authority a requirement comes from. */
export function AuthorityChip({ jurisdiction }: { jurisdiction: string }) {
  const tone = authorityTone(jurisdiction);
  const label =
    JURISDICTION_LABELS[jurisdiction as PolicyJurisdiction] ?? jurisdiction;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium uppercase leading-none tracking-[0.1em] ${tone.text} ${tone.border}`}
    >
      {label}
    </span>
  );
}

import { JURISDICTION_LABELS, type PolicyJurisdiction } from '@/types';

/**
 * Which level of authority a requirement comes from.
 *
 * Brightness carries the hierarchy: federal is the brightest rung and school
 * the dimmest, consistently everywhere the chip appears. There is no colour
 * here on purpose -- in this UI colour means a deadline state and nothing
 * else. (design 1c/1j)
 */
const TONE: Record<string, string> = {
  federal: 'text-text border-line-strong',
  state: 'text-text-secondary border-line-strong',
  district: 'text-text-tertiary border-line',
  school: 'text-text-muted border-line',
};

export function AuthorityChip({ jurisdiction }: { jurisdiction: string }) {
  const tone = TONE[jurisdiction] ?? TONE.school;
  const label =
    JURISDICTION_LABELS[jurisdiction as PolicyJurisdiction] ?? jurisdiction;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium uppercase leading-none tracking-[0.1em] ${tone}`}
    >
      {label}
    </span>
  );
}

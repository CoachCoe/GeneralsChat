/**
 * How much brightness each level of authority gets.
 *
 * Federal is the brightest and school the dimmest, consistently everywhere
 * authority is shown. No colour: colour means a deadline state and nothing
 * else. (design 1c/1j)
 *
 * One ramp, because it was two — a chip and a ladder rung side by side, each
 * with its own map, free to drift into saying that the same policy carries
 * different weight depending on which component drew it.
 */
export const AUTHORITY_TEXT: Record<string, string> = {
  federal: 'text-text',
  state: 'text-text-secondary',
  district: 'text-text-tertiary',
  school: 'text-text-muted',
};

export const AUTHORITY_DOT: Record<string, string> = {
  federal: 'bg-text',
  state: 'bg-text-secondary',
  district: 'bg-text-tertiary',
  school: 'bg-line-strong',
};

/** The chip's border follows the same ramp, one step coarser. */
export const AUTHORITY_BORDER: Record<string, string> = {
  federal: 'border-line-strong',
  state: 'border-line-strong',
  district: 'border-line',
  school: 'border-line',
};

export function authorityTone(jurisdiction: string) {
  return {
    text: AUTHORITY_TEXT[jurisdiction] ?? AUTHORITY_TEXT.school,
    dot: AUTHORITY_DOT[jurisdiction] ?? AUTHORITY_DOT.school,
    border: AUTHORITY_BORDER[jurisdiction] ?? AUTHORITY_BORDER.school,
  };
}

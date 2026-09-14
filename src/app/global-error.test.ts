import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * `global-error.tsx` replaces the root layout, so it cannot import the
 * stylesheet and has to inline the token values it needs.
 *
 * A comment saying "keep them in step" is not a mechanism. Getting them wrong
 * is easy — the first attempt here swapped `text-tertiary` and `text-muted`,
 * and then read them out of the `@media print` block, which is the light
 * palette. This is the mechanism.
 */
const TOKENS = [
  'bg',
  'surface',
  'line',
  'text',
  'text-secondary',
  'text-tertiary',
  'text-muted',
] as const;

function themeValue(name: string): string | null {
  const css = readFileSync('src/app/theme.css', 'utf8');
  // The `@theme` block, not the `:root` inside `@media print`.
  const block = css.slice(css.indexOf('@theme {'));
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]+);`).exec(block);
  return match?.[1] ?? null;
}

function globalErrorValue(name: string): string | null {
  const source = readFileSync('src/app/global-error.tsx', 'utf8');
  const match = new RegExp(`--gc-${name}' as string\\]: '(#[0-9a-fA-F]+)'`).exec(source);
  return match?.[1] ?? null;
}

describe('global-error inlined palette', () => {
  it.each(TOKENS)('--gc-%s equals the theme token it copies', name => {
    const theme = themeValue(name);
    expect(theme, `--color-${name} missing from theme.css`).not.toBeNull();
    expect(globalErrorValue(name), `--gc-${name} missing from global-error.tsx`).toBe(theme);
  });

  it('spends no state colour on an error page', () => {
    // Colour means a deadline state or a coverage gap. An error is neither, and
    // "Try Again" was painted the green that means an obligation was discharged.
    const source = readFileSync('src/app/global-error.tsx', 'utf8');
    for (const state of ['overdue', 'attention', 'met'] as const) {
      const value = new RegExp(`--color-${state}:\\s*(#[0-9a-fA-F]+);`).exec(
        readFileSync('src/app/theme.css', 'utf8')
      )?.[1];
      expect(value, state).toBeTruthy();
      expect(source.toLowerCase()).not.toContain(value!.toLowerCase());
    }
  });
});

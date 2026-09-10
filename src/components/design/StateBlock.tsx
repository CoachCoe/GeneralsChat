/**
 * The shared empty / loading / error surface.
 *
 * Shared so the three states do not look different depending on which page
 * you hit them from. (design 1j)
 */
export function StateBlock({
  variant = 'empty',
  title,
  body,
  action,
}: {
  variant?: 'empty' | 'loading' | 'error';
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={variant === 'error' ? 'alert' : undefined}
      aria-busy={variant === 'loading' || undefined}
      className="flex flex-col items-center gap-3 rounded-[16px] border border-line bg-surface px-6 py-14 text-center"
    >
      {variant === 'loading' && (
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-text"
          aria-hidden
        />
      )}
      {/*
        Not red. An error state is not a deadline state, and `CLAUDE.md` names
        it: colour "means a deadline state ... or a coverage gap (amber).
        Nothing else ... never severity, error states or decoration." A red
        "Could not load your obligations" competes with the red that means
        something is legally late, on the same screen. The `role="alert"` and
        the copy carry it instead.
      */}
      <span className="font-display text-[26px] leading-[1.2] tracking-[-0.02em] text-text">
        {title}
      </span>
      {body && <p className="max-w-[46ch] text-[15px] leading-[1.65] text-text-tertiary">{body}</p>}
      {action}
    </div>
  );
}

/**
 * The shared empty / loading / error surface.
 *
 * Every page previously rolled its own, so the three states looked different
 * depending on where you hit them. (design 1j)
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
      <span
        className={`font-display text-[26px] leading-[1.2] tracking-[-0.02em] ${
          variant === 'error' ? 'text-overdue' : 'text-text'
        }`}
      >
        {title}
      </span>
      {body && <p className="max-w-[46ch] text-[15px] leading-[1.65] text-text-tertiary">{body}</p>}
      {action}
    </div>
  );
}

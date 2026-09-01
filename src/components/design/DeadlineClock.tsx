'use client';

import { describeDeadline, DEADLINE_COLOR } from '@/lib/deadline';
import { useMounted } from '@/lib/useMounted';

/**
 * The remaining interval, and the wall-clock time beneath it.
 *
 * Tabular mono so the digits do not jitter as a countdown ticks, and a fixed
 * column width so a list of these reads as a column rather than ragged text.
 * (design 1a/1c)
 */
export function DeadlineClock({
  dueDate,
  status,
  completedAt,
  className = '',
}: {
  dueDate: string | Date | null | undefined;
  status: string;
  completedAt?: string | Date | null;
  className?: string;
}) {
  const mounted = useMounted();
  const { state, label, absolute } = describeDeadline(dueDate, status, completedAt);

  return (
    <div className={`flex w-[120px] flex-none flex-col gap-[3px] ${className}`}>
      {/* Reserve the line height so nothing shifts when the client fills it in. */}
      <span className={`tabular text-[15px] font-medium leading-none ${DEADLINE_COLOR[state]}`}>
        {mounted ? label : '\u00a0'}
      </span>
      {mounted && absolute && (
        <span className="text-[11px] leading-[1.3] text-text-muted">{absolute}</span>
      )}
    </div>
  );
}

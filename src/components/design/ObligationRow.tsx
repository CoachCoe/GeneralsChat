'use client';

import { useState } from 'react';
import { DeadlineClock } from './DeadlineClock';
import { AuthorityChip } from './AuthorityChip';
import { isPolicyBacked } from '@/lib/deadline';

export interface Obligation {
  id: string;
  actionType: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  incidentId: string;
  incidentTitle?: string;
  jurisdiction?: string | null;
  /**
   * Nullable, because that is what the column is. These were optional-but-not-null,
   * so every caller holding real rows needed an `as Obligation` cast -- and the
   * cast is what hid `deadlineSource` from the incident page's own overdue
   * count, which then painted model-recalled deadlines red.
   */
  citation?: string | null;
  /** 'policy' when a retrieved excerpt states this deadline, else 'model'. */
  deadlineSource?: string | null;
}

/**
 * One statutory obligation: when it is due, what it is, what it rests on, and
 * the single action that changes its state.
 *
 * "Mark done" is the only mutation. Obligations are created when the incident
 * is classified rather than proposed and accepted, so there is no queueing
 * step to represent.
 */
export function ObligationRow({
  obligation,
  onDone,
  showIncident = false,
}: {
  obligation: Obligation;
  onDone?: (id: string) => Promise<void> | void;
  showIncident?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const done = obligation.status === 'completed';

  const handleDone = async () => {
    if (!onDone || busy || done) return;
    setBusy(true);
    try {
      await onDone(obligation.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    // Container query, not `sm:`. The same row renders in the wide queue on the
    // home page and in the 340px aside on an incident -- and a viewport
    // breakpoint cannot tell those apart, so at any desktop width the aside got
    // the three-column row layout and squeezed the description to one word per
    // line. `@sm` (24rem) measures the space the row actually has.
    <div
      // A stable handle for "one obligation row", so a test can assert the
      // queue is exhaustive -- that the number of rows rendered equals the
      // number of open obligations the API reports. Three groups of filters
      // can each drop an unverified late row with nothing able to see it.
      data-testid="obligation-row"
      className="@container border-b border-input last:border-b-0"
    >
      <div className="flex flex-col gap-3 px-5 py-[18px] @sm:flex-row @sm:gap-[18px]">
        <DeadlineClock
          dueDate={obligation.dueDate}
          status={obligation.status}
          completedAt={obligation.completedAt}
          verified={isPolicyBacked(obligation.deadlineSource)}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span
            className={`text-[16px] font-medium leading-[1.4] ${
              done ? 'text-text-muted line-through' : 'text-text'
            }`}
          >
            {obligation.description || obligation.actionType}
          </span>

          {obligation.incidentTitle && showIncident && (
            <span className="text-[12px] text-text-muted">{obligation.incidentTitle}</span>
          )}

          {!isPolicyBacked(obligation.deadlineSource) && !done && (
            <span className="text-[12px] leading-[1.4] text-text-muted">
              Deadline not found in the loaded policy — confirm it before acting.
            </span>
          )}

          {(obligation.jurisdiction || obligation.citation) && (
            <div className="flex items-center gap-2">
              {obligation.jurisdiction && <AuthorityChip jurisdiction={obligation.jurisdiction} />}
              {obligation.citation && (
                <span className="text-[12px] text-text-muted">{obligation.citation}</span>
              )}
            </div>
          )}
        </div>

        {onDone && !done && (
          <button
            type="button"
            onClick={handleDone}
            disabled={busy}
            className="inline-flex min-h-[44px] flex-none items-center self-start rounded-[12px] bg-text px-[14px] text-[13px] font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Mark done'}
          </button>
        )}
      </div>
    </div>
  );
}

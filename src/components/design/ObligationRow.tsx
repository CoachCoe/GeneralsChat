'use client';

import { useState } from 'react';
import { DeadlineClock } from './DeadlineClock';
import { AuthorityChip } from './AuthorityChip';

export interface Obligation {
  id: string;
  actionType: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  incidentId: string;
  incidentTitle?: string;
  jurisdiction?: string;
  citation?: string;
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
    <div className="flex flex-col gap-3 border-b border-input px-5 py-[18px] last:border-b-0 sm:flex-row sm:gap-[18px]">
      <DeadlineClock
        dueDate={obligation.dueDate}
        status={obligation.status}
        completedAt={obligation.completedAt}
      />

      <div className="flex flex-1 flex-col gap-1.5">
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
  );
}

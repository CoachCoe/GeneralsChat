'use client';

import { useState } from 'react';

export interface CompletionSuggestion {
  id: string;
  description: string;
}

/**
 * Obligations the administrator said, in conversation, that they had already
 * carried out -- offered back as something to confirm.
 *
 * Confirming is the write. The model's reading of "I called DCYF this morning"
 * is good enough to raise the question and not good enough to answer it:
 * `completedAt` is the record that a statutory obligation was discharged, and
 * the queue built on it is what stops a deadline being missed. A person stays
 * in front of that, so the audit row names one.
 *
 * No colour. Colour here means a deadline state or a coverage gap, and this is
 * neither -- it is a question, and one the administrator can ignore.
 */
export function CompletionConfirm({ suggestions }: { suggestions: CompletionSuggestion[] }) {
  // Dismissed and confirmed are both "stop offering this", but only one of
  // them writes. Dismissal is local and deliberately not persisted: it is not
  // a statement that the step is undone, just that this offer was not wanted.
  const [settled, setSettled] = useState<Record<string, 'saving' | 'done' | 'dismissed' | 'failed'>>({});

  const pending = suggestions.filter(s => settled[s.id] !== 'done' && settled[s.id] !== 'dismissed');
  if (pending.length === 0) return null;

  const confirm = async (id: string) => {
    setSettled(prev => ({ ...prev, [id]: 'saving' }));
    try {
      const response = await fetch(`/api/obligations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setSettled(prev => ({ ...prev, [id]: 'done' }));
    } catch {
      // The obligation is unchanged, so say so rather than hiding the row:
      // a queue that silently failed to record a completion is the same
      // failure as one that recorded a completion nobody made.
      setSettled(prev => ({ ...prev, [id]: 'failed' }));
    }
  };

  return (
    <div
      data-testid="completion-suggestion"
      style={{
        marginTop: '16px',
        border: '1px solid var(--color-line)',
        borderRadius: '12px',
        padding: '12px 14px',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <span className="eyebrow">Mentioned as done</span>
      {pending.map(suggestion => (
        <div
          key={suggestion.id}
          data-testid="completion-suggestion-row"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
        >
          <span style={{ flex: '1 1 220px', fontSize: '14px', color: 'var(--color-text)' }}>
            {suggestion.description}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              disabled={settled[suggestion.id] === 'saving'}
              onClick={() => confirm(suggestion.id)}
              style={{
                minHeight: '32px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-line-strong)',
                background: 'transparent',
                color: 'var(--color-text)',
                fontSize: '13px',
                cursor: settled[suggestion.id] === 'saving' ? 'progress' : 'pointer',
              }}
            >
              Mark done
            </button>
            <button
              type="button"
              onClick={() => setSettled(prev => ({ ...prev, [suggestion.id]: 'dismissed' }))}
              style={{
                minHeight: '32px',
                padding: '0 12px',
                borderRadius: '8px',
                border: '1px solid transparent',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Not yet
            </button>
          </div>
          {settled[suggestion.id] === 'failed' && (
            <span role="alert" style={{ flexBasis: '100%', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              That could not be saved. The obligation is still open.
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

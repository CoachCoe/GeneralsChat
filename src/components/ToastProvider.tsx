'use client';

import { Toaster } from 'react-hot-toast';

/**
 * Toast Provider Component
 *
 * Provides toast notifications throughout the application
 * using react-hot-toast
 */
export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-line)',
          borderRadius: '0.75rem',
          padding: '1rem',
        },
        // No per-state colour. Colour in this interface means a deadline state
        // -- overdue, attention, met -- or a coverage gap, and nothing else. A
        // red toast beside a red overdue countdown is exactly the competition
        // that rule exists to prevent, and green is what "obligation discharged"
        // looks like on the queue. The words on the toast carry the meaning.
        error: { duration: 5000 },
      }}
    />
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useMounted } from '@/lib/useMounted';
import type { NotificationItem } from '@/lib/notifications';

/**
 * What has changed, and what is about to be late.
 *
 * Deliberately not a second copy of the obligation queue: the home page already
 * lists every open obligation, and this raises only what is inside the
 * attention window or already past it. One telling, not three -- the same rule
 * the coverage gap follows.
 *
 * Red is earned. It appears only when something a district policy actually
 * states is late, which is what `overdue` means on the server. A share and an
 * unread message are neutral: they are news, not a deadline state.
 *
 * Polled rather than pushed. There is one instance and no socket layer, so the
 * honest options were polling or nothing. Rendered only for a signed-in user --
 * `/about` is reachable without a session, and a bell there would poll a route
 * that answers 401 every minute forever.
 */
const POLL_MS = 60_000;

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [overdue, setOverdue] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const mounted = useMounted();

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications');
      if (!response.ok) return;
      const body = await response.json();
      setItems(body.items);
      setOverdue(body.overdue);
    } catch {
      // A failed poll is not worth telling anyone about; the next one is 60s away.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const count = items.length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        data-testid="notification-bell"
        aria-label={count > 0 ? `Notifications, ${count} waiting` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-[44px] items-center gap-2 px-2"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <Bell size={18} />
        {mounted && count > 0 && (
          <span
            data-testid="notification-count"
            style={{
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              fontSize: '12px',
              color: overdue > 0 ? 'var(--color-overdue)' : 'var(--color-text)',
            }}
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-1 flex w-[340px] flex-col overflow-hidden rounded-[16px] border shadow-lg"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-surface)' }}
        >
          {items.length === 0 ? (
            <p className="px-4 py-5 text-[14px]" style={{ color: 'var(--color-text-muted)' }}>
              Nothing needs you right now.
            </p>
          ) : (
            items.map((item, index) => (
              <Link
                key={item.key}
                href={item.href}
                data-testid="notification-item"
                onClick={() => setOpen(false)}
                className="flex flex-col gap-1 px-4 py-3"
                style={{ borderTop: index === 0 ? 'none' : '1px solid var(--color-line)' }}
              >
                <span
                  className="text-[14px]"
                  style={{ color: item.overdue ? 'var(--color-overdue)' : 'var(--color-text)' }}
                >
                  {item.title}
                </span>
                <span className="flex items-baseline gap-2">
                  <span
                    className="flex-1 truncate text-[13px]"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {item.detail}
                  </span>
                  <span
                    className="text-[12px]"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {mounted ? new Date(item.at).toLocaleDateString() : ''}
                  </span>
                </span>
              </Link>
            ))
          )}

          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="px-4 py-3 text-[13px]"
            style={{
              borderTop: '1px solid var(--color-line)',
              color: 'var(--color-text-secondary)',
            }}
          >
            Everything due →
          </Link>
        </div>
      )}
    </div>
  );
}

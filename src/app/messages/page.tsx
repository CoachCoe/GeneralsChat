'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import toast from 'react-hot-toast';
import { useMounted } from '@/lib/useMounted';

/**
 * Messages between people.
 *
 * Not the assistant. The assistant's transcript is an incident record and lives
 * on /chat; this is colleagues talking, and the two are never named alike.
 *
 * A thread may name an incident, which links to it — but membership of a thread
 * grants nothing over that incident. Following the link without a share gets
 * the same 404 any stranger gets.
 */
interface Person {
  id: string;
  name: string;
}

interface ThreadSummary {
  id: string;
  title: string | null;
  incidentId: string | null;
  updatedAt: string;
  participants: Person[];
  lastMessage: { body: string; createdAt: string; sender: { name: string } } | null;
  unread: number;
}

interface ThreadMessage {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string };
}

interface OpenThread {
  id: string;
  title: string | null;
  incidentId: string | null;
  participants: Person[];
  messages: ThreadMessage[];
}

/** A thread with no title is named by the people in it. */
function threadName(participants: Person[], title: string | null): string {
  if (title) return title;
  const names = participants.map(p => p.name);
  return names.length > 0 ? names.join(', ') : 'Conversation';
}

export default function MessagesPage() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [open, setOpen] = useState<OpenThread | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [composing, setComposing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const mounted = useMounted();
  const endRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    const response = await fetch('/api/threads');
    if (response.ok) setThreads((await response.json()).threads);
  }, []);

  useEffect(() => {
    loadThreads();
    fetch('/api/users')
      .then(r => (r.ok ? r.json() : { users: [] }))
      .then(body => setPeople(body.users));
  }, [loadThreads]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open?.messages.length]);

  const openThread = async (id: string) => {
    const response = await fetch(`/api/threads/${id}`);
    if (!response.ok) {
      toast.error('That conversation is no longer available');
      return;
    }
    setOpen((await response.json()).thread);
    setComposing(false);
    // One draft box, two places it can be. Carrying half a message from the
    // new-conversation composer into an existing thread is how it gets sent to
    // the wrong people.
    setDraft('');
    // Reading it clears its unread count, so the list has to be re-read.
    await loadThreads();
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || sending || !open) return;
    setSending(true);
    try {
      const response = await fetch(`/api/threads/${open.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      if (!response.ok) {
        toast.error('Could not send that message');
        return;
      }
      const { message } = await response.json();
      setOpen({ ...open, messages: [...open.messages, message] });
      setDraft('');
      await loadThreads();
    } finally {
      setSending(false);
    }
  };

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    if (chosen.length === 0 || !draft.trim() || sending) return;
    setSending(true);
    try {
      const response = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: chosen, body: draft }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error ?? 'Could not start that conversation');
        return;
      }
      const { thread } = await response.json();
      setDraft('');
      setChosen([]);
      await loadThreads();
      await openThread(thread.id);
    } finally {
      setSending(false);
    }
  };

  const when = (iso: string) => (mounted ? new Date(iso).toLocaleString() : '');

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-4 py-8 lg:flex-row">
        <nav
          aria-label="Conversations"
          className="flex w-full flex-none flex-col gap-3 lg:w-[300px]"
        >
          <div className="flex items-center justify-between">
            <span className="eyebrow">Conversations</span>
            <button
              type="button"
              onClick={() => {
                setComposing(true);
                setOpen(null);
                setDraft('');
              }}
              className="min-h-[32px] rounded-[8px] border px-3 text-[13px]"
              style={{ borderColor: 'var(--color-line-strong)', color: 'var(--color-text)' }}
            >
              New
            </button>
          </div>

          <div
            className="flex flex-col overflow-hidden rounded-[16px] border"
            style={{ borderColor: 'var(--color-line)' }}
          >
            {threads.length === 0 && (
              <p className="px-4 py-5 text-[14px]" style={{ color: 'var(--color-text-muted)' }}>
                No conversations yet.
              </p>
            )}
            {threads.map((thread, index) => (
              <button
                key={thread.id}
                type="button"
                data-testid="thread-list-item"
                onClick={() => openThread(thread.id)}
                className="flex flex-col gap-1 px-4 py-3 text-left"
                style={{
                  borderTop: index === 0 ? 'none' : '1px solid var(--color-line)',
                  background:
                    open?.id === thread.id ? 'var(--color-input)' : 'var(--color-surface)',
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="flex-1 text-[14px]" style={{ color: 'var(--color-text)' }}>
                    {threadName(thread.participants, thread.title)}
                  </span>
                  {thread.unread > 0 && (
                    <span
                      data-testid="thread-unread"
                      className="text-[12px]"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums',
                        color: 'var(--color-text)',
                      }}
                    >
                      {thread.unread}
                    </span>
                  )}
                </span>
                {thread.lastMessage && (
                  <span
                    className="line-clamp-1 text-[13px]"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {thread.lastMessage.sender.name}: {thread.lastMessage.body}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>

        <section className="flex min-w-0 flex-1 flex-col gap-3">
          {composing && (
            <form onSubmit={start} className="flex flex-col gap-4">
              <span className="eyebrow">New conversation</span>
              <div className="flex flex-wrap gap-2">
                {people.length === 0 && (
                  <p className="text-[14px]" style={{ color: 'var(--color-text-muted)' }}>
                    There is nobody else to message yet.
                  </p>
                )}
                {people.map(person => {
                  const picked = chosen.includes(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      data-testid="person-option"
                      aria-pressed={picked}
                      onClick={() =>
                        setChosen(
                          picked ? chosen.filter(id => id !== person.id) : [...chosen, person.id]
                        )
                      }
                      className="min-h-[36px] rounded-[999px] border px-3 text-[13px]"
                      style={{
                        borderColor: picked
                          ? 'var(--color-line-strong)'
                          : 'var(--color-line)',
                        background: picked ? 'var(--color-input)' : 'transparent',
                        color: 'var(--color-text)',
                      }}
                    >
                      {person.name}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Write the first message"
                rows={4}
                data-testid="message-input"
                className="rounded-[12px] border p-3 text-[15px]"
                style={{
                  borderColor: 'var(--color-line)',
                  background: 'var(--color-input)',
                  color: 'var(--color-text)',
                }}
              />
              <button
                type="submit"
                disabled={sending || chosen.length === 0 || !draft.trim()}
                className="min-h-[44px] self-start rounded-[10px] border px-4 text-[14px] disabled:opacity-50"
                style={{ borderColor: 'var(--color-line-strong)', color: 'var(--color-text)' }}
              >
                Start conversation
              </button>
            </form>
          )}

          {!composing && !open && (
            <p className="text-[14px]" style={{ color: 'var(--color-text-muted)' }}>
              Choose a conversation, or start a new one.
            </p>
          )}

          {open && (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h1
                  className="font-display text-[24px]"
                  style={{ color: 'var(--color-text)' }}
                >
                  {threadName(open.participants, open.title)}
                </h1>
                {open.incidentId && (
                  <Link
                    href={`/incidents/${open.incidentId}`}
                    className="text-[13px] underline"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    Open the incident
                  </Link>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {open.messages.map(message => (
                  <article
                    key={message.id}
                    data-testid="message-row"
                    className="flex flex-col gap-1 rounded-[12px] border p-3"
                    style={{
                      borderColor: 'var(--color-line)',
                      background: 'var(--color-surface)',
                    }}
                  >
                    <span className="flex items-baseline gap-3">
                      <span className="text-[14px]" style={{ color: 'var(--color-text)' }}>
                        {message.sender.name}
                      </span>
                      <span
                        className="text-[12px]"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {when(message.createdAt)}
                      </span>
                    </span>
                    <p
                      className="whitespace-pre-wrap text-[15px]"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      {message.body}
                    </p>
                  </article>
                ))}
                <div ref={endRef} />
              </div>

              <form onSubmit={send} className="flex flex-col gap-2">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  placeholder="Write a message"
                  rows={3}
                  data-testid="message-input"
                  className="rounded-[12px] border p-3 text-[15px]"
                  style={{
                    borderColor: 'var(--color-line)',
                    background: 'var(--color-input)',
                    color: 'var(--color-text)',
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  data-testid="message-send"
                  className="min-h-[44px] self-start rounded-[10px] border px-4 text-[14px] disabled:opacity-50"
                  style={{ borderColor: 'var(--color-line-strong)', color: 'var(--color-text)' }}
                >
                  Send
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

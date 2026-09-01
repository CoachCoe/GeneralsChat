'use client';

import Link from 'next/link';

export interface Segment {
  value: string;
  label: string;
  count?: number;
}

/**
 * One list, several views. Replaces four near-identical list routes reached
 * from four different places, which gave no sense of where you were or how
 * they related. (design 1f/1j)
 *
 * Links rather than local state, so a segment is addressable and shareable.
 */
export function SegmentedTabs({
  segments,
  active,
  basePath,
  onSelect,
}: {
  segments: Segment[];
  active: string;
  basePath: string;
  /** When given, segments filter in place instead of navigating. */
  onSelect?: (value: string) => void;
}) {
  return (
    <nav aria-label="Filter incidents" className="flex flex-wrap gap-1.5">
      {segments.map(segment => {
        const selected = segment.value === active;
        const className = `inline-flex min-h-[44px] items-center gap-2 rounded-full border px-[13px] text-[13px] leading-none transition-colors ${
          selected
            ? 'border-line-strong bg-input text-text'
            : 'border-line text-text-tertiary hover:border-line-strong hover:text-text'
        }`;
        const body = (
          <>
            {segment.label}
            {segment.count !== undefined && (
              <span className="tabular text-[12px] text-text-muted">{segment.count}</span>
            )}
          </>
        );

        return onSelect ? (
          <button
            key={segment.value}
            type="button"
            onClick={() => onSelect(segment.value)}
            aria-pressed={selected}
            className={className}
          >
            {body}
          </button>
        ) : (
          <Link
            key={segment.value}
            href={`${basePath}?segment=${segment.value}`}
            aria-current={selected ? 'page' : undefined}
            className={className}
          >
            {body}
          </Link>
        );
      })}
    </nav>
  );
}

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
}: {
  segments: Segment[];
  active: string;
  basePath: string;
}) {
  return (
    <nav aria-label="Filter incidents" className="flex flex-wrap gap-1.5">
      {segments.map(segment => {
        const selected = segment.value === active;
        return (
          <Link
            key={segment.value}
            href={`${basePath}?segment=${segment.value}`}
            aria-current={selected ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-[13px] py-[9px] text-[13px] leading-none transition-colors ${
              selected
                ? 'border-line-strong bg-input text-text'
                : 'border-line text-text-tertiary hover:border-line-strong hover:text-text'
            }`}
          >
            {segment.label}
            {segment.count !== undefined && (
              <span className="tabular text-[12px] text-text-muted">{segment.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

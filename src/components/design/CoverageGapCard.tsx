import { CATEGORY_LABELS } from '@/types';

/**
 * A category the incident implicates that no district or school policy covers.
 *
 * Deliberately amber and not red: this is attention, not alarm. The guidance
 * above it is still sound -- it rests on the statute directly -- and the point
 * is to stop the administrator following a local procedure that does not
 * exist, and to tell the district it has a hole. (design 1c/1j)
 */
export function CoverageGapCard({ categories }: { categories: string[] }) {
  if (categories.length === 0) return null;

  const named = categories.map(c => CATEGORY_LABELS[c] ?? c);
  const list =
    named.length === 1
      ? named[0].toLowerCase()
      : `${named.slice(0, -1).join(', ').toLowerCase()} and ${named[named.length - 1].toLowerCase()}`;

  return (
    <div className="flex gap-[14px] rounded-[16px] border border-attention/40 bg-attention/[0.07] px-5 py-[18px]">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="mt-0.5 flex-none text-attention"
        aria-hidden
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 15h6" />
      </svg>
      <div className="flex flex-col gap-1.5">
        <span className="text-[15px] font-medium leading-[1.3] text-text">
          No district or school policy covers {list}
        </span>
        <span className="text-[14px] leading-[1.6] text-text-secondary">
          The guidance above uses the state and federal requirements directly. It is sound, but
          there is no local procedure to follow for this part — document your reasoning in the
          incident file.
        </span>
      </div>
    </div>
  );
}

import { redirect } from 'next/navigation';

/**
 * Four near-identical list routes collapsed into one segmented list. This
 * route is kept as a redirect so existing links and bookmarks still work.
 * (design 1j)
 */
export default function ActiveIncidentsPage() {
  redirect('/incidents?segment=open');
}

import { CATEGORY_LABELS } from '@/types';

/**
 * How the loaded subjects are read out to an administrator.
 *
 * Its own function because the sentence has to stay true in three states that
 * are easy to get wrong: nothing loaded at all, one subject, and several. A
 * pilot begins in the first, spends most of its life in the second, and the
 * difference between "covers bullying" and "covers bullying, Title IX and
 * mandatory reporting" is the difference between an administrator who knows to
 * go and ask and one who does not.
 */
export function describeLibraryScope(categories: string[]): string {
  // The labels as written. Lowercasing them turned "Title IX" into "title ix"
  // and "Student Records (FERPA)" into something nobody writes; these are the
  // names of policy areas, not common nouns.
  const named = categories.map(c => CATEGORY_LABELS[c] ?? c);

  if (named.length === 0) {
    return 'No district or school policy is loaded yet, so the assistant will say so rather than answer from federal or state law as though it were local procedure.';
  }

  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;

  return `Your district has loaded policy for ${list}. Ask about anything else and the assistant will tell you nothing local covers it.`;
}

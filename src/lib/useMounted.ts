'use client';

import { useEffect, useState } from 'react';

/**
 * True only after the client has mounted.
 *
 * Anything derived from `new Date()` differs between the server render and the
 * client hydration -- a countdown that says "in 3h 18m" on one and "in 3h 17m"
 * on the other is a hydration mismatch (React #418), and so is any date
 * formatted in a server timezone that is not the viewer's. Time-derived text
 * therefore renders only on the client; the server emits the same placeholder
 * the client's first pass does, so the two always agree.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

import { NextResponse } from 'next/server';

/**
 * Liveness probe for the container platform.
 *
 * Deliberately unauthenticated — a probe carries no session — and deliberately
 * says nothing. No version, no environment, no dependency status: this is the
 * one route reachable without signing in to an application holding incident
 * records about minors, so it must not become a reconnaissance surface.
 *
 * Also deliberately does NOT touch the database. A liveness probe that fails
 * when Postgres is briefly unreachable makes the platform kill and restart a
 * process that is working, turning a short database blip into a restart loop
 * that lasts as long as the blip. The question this answers is "is the Node
 * process serving HTTP", which is the only question a restart can fix.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * TEMPORARY diagnostics endpoint. DELETE with `src/lib/auth/diagnostics.ts`.
 *
 * Exists because neither of the log sinks the diagnostics were written for is
 * reachable: Netlify's function log stream carries only the platform's own
 * `Duration:` lines for the Next.js handler, and the build log is not exposed
 * through the public API. The same presence/length/shape report is served here
 * instead, where it can be read over HTTP.
 *
 * ## Why this is safe to have on a public deploy
 *
 * - Without a correct `?t=` it is indistinguishable from a route that does not
 *   exist: 404, empty body, no timing signal worth the name (the comparison is
 *   `timingSafeEqual` over SHA-256 digests, so candidate length leaks nothing).
 * - `AUTHDIAG_TOKEN` is 32 random bytes, lives only in Netlify as a secret, and
 *   is not in this repository.
 * - The body it returns carries presence, length and shape only — the same
 *   discipline as `diagnostics.ts`, which is where every value in it comes from.
 * - `force-dynamic` and `no-store`: never prerendered, never cached at the edge,
 *   so a response cannot outlive the token.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { collectAuthDiagnostics } from '@/lib/auth/diagnostics';

export const dynamic = 'force-dynamic';

const NOT_FOUND = new Response(null, { status: 404 });

/**
 * Compare over fixed-width digests rather than the raw strings: `timingSafeEqual`
 * throws on a length mismatch, and letting it throw would turn candidate length
 * into an oracle.
 */
function tokenMatches(candidate: string | null): boolean {
  const expected = process.env.AUTHDIAG_TOKEN;
  if (!expected || !candidate) return false;
  return timingSafeEqual(
    createHash('sha256').update(candidate).digest(),
    createHash('sha256').update(expected).digest(),
  );
}

export async function GET(request: Request): Promise<Response> {
  if (!tokenMatches(new URL(request.url).searchParams.get('t'))) return NOT_FOUND;

  return Response.json(await collectAuthDiagnostics(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

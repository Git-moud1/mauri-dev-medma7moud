import { NextResponse, type NextRequest } from 'next/server';

/**
 * Stub proxy. Next 16 renamed `middleware.ts` to `proxy.ts` and the named
 * export `middleware` to `proxy`; the file is picked up at either the repo
 * root or `src/`, and this project uses `src/`.
 *
 * Always runs on the Node.js runtime — the `edge` runtime is not supported in
 * proxy and cannot be configured.
 *
 * The locale-redirect logic lands in a later task; for now every request
 * passes straight through.
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

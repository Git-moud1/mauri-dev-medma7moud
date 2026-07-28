import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, negotiateLocale, LOCALE_COOKIE } from '@/i18n/locale';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';

/**
 * Two jobs: redirect `/` to the visitor's best-match locale, and turn away
 * signed-out requests to `/admin/*`.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts` and the named export
 * `middleware` to `proxy`; the file is picked up at either the repo root or
 * `src/`, and this project uses `src/`.
 *
 * Runs on the Node.js runtime — Next 16 does not support the edge runtime in
 * proxy and it cannot be configured.
 *
 * **The admin check here is a first pass, not the security boundary.** A
 * matcher change, a route that stops matching, or a directly invoked server
 * action would all bypass it. Every action re-verifies the session itself; an
 * action that trusts this function is an action with no auth. What this does
 * buy is that a signed-out visitor lands on the login page instead of a
 * flash of dashboard chrome.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // `/admin` itself is the login page and stays open. Everything under it does
  // not.
  if (pathname.startsWith('/admin/')) {
    const valid = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (valid) return NextResponse.next();

    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url, 307);
  }

  // Only the bare root is redirected. Anything already carrying a locale
  // segment — or any other path, which the route tree will 404 — passes through.
  if (pathname !== '/') return NextResponse.next();

  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie)
    ? cookie
    : negotiateLocale(request.headers.get('accept-language'));

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, negotiateLocale, LOCALE_COOKIE } from '@/i18n/locale';

/**
 * Redirects `/` to the visitor's best-match locale. Preference order:
 * the bc-locale cookie, then Accept-Language, then Arabic.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts` and the named export
 * `middleware` to `proxy`; the file is picked up at either the repo root or
 * `src/`, and this project uses `src/`.
 *
 * Runs on the Node.js runtime — Next 16 does not support the edge runtime in
 * proxy and it cannot be configured. Routing and headers only; no auth logic
 * lives here (plan 2 adds an /admin guard, but every server action still
 * re-verifies its own session).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

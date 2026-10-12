import 'server-only';
import { cookies, headers } from 'next/headers';
import { readCredential } from './credential';
import { readSession, SESSION_COOKIE } from './session';

/**
 * The caller's IP, for rate limiting only. Netlify's own header first; it is
 * set by the edge and not forwarded from the client.
 */
export async function clientIp(): Promise<string> {
  const store = await headers();
  return (
    store.get('x-nf-client-connection-ip') ??
    store.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * The real session check, used by every admin action and page.
 *
 * A token must be genuine and unexpired AND carry the credential's current
 * session version — so a password change or reset signs out every other
 * session at once. A store error answers "not signed in": the admin is
 * unusable without the store anyway, and failing open here would accept
 * sessions that a password change was meant to end.
 */
export async function hasValidSession(): Promise<boolean> {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return false;
  try {
    const credential = await readCredential();
    return credential !== null && credential.sessionVersion === session.sessionVersion;
  } catch {
    return false;
  }
}

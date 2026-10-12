import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'md-session';

/** Eight hours: long enough for a working session, short enough that a stolen
 *  cookie expires on its own. */
const EXPIRY = '8h';
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET is not set');
  return new TextEncoder().encode(value);
}

/**
 * `sv` is the credential's session version at sign-in. A password change or
 * reset increments the stored version, and every token carrying an older one
 * stops being accepted by `requireSession` — that is how old sessions are
 * invalidated without a session table.
 */
export async function createSession(sessionVersion: number): Promise<string> {
  return new SignJWT({ role: 'admin', sv: sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret());
}

/**
 * The session's claims if the token is genuine and unexpired, else null.
 *
 * Fails closed on every path: no token, bad signature, expired, wrong claim, or
 * no secret configured. A thrown `AUTH_SECRET is not set` must not become an
 * authenticated request, so the throw is caught here rather than propagating.
 *
 * Tokens issued before session versions existed carry no `sv`; they read as 0,
 * the bootstrap credential's version, and stop working at the first change.
 */
export async function readSession(
  token: string | undefined,
): Promise<{ sessionVersion: number } | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== 'admin') return null;
    const sv = typeof payload.sv === 'number' ? payload.sv : 0;
    return { sessionVersion: sv };
  } catch {
    return null;
  }
}

/**
 * Signature and expiry only — the proxy's FIRST PASS. It cannot see the stored
 * session version; `requireSession` in the admin actions is the real check.
 */
export async function verifySession(token: string | undefined): Promise<boolean> {
  return (await readSession(token)) !== null;
}

/**
 * The attributes every session cookie write must use. Exported as one object so
 * the login action and any future refresh cannot drift apart on them:
 *
 * - `httpOnly` — JavaScript cannot read it, so an XSS cannot exfiltrate it.
 * - `secure` — never sent over plain http.
 * - `sameSite: 'strict'` — not sent on cross-site requests at all, which is the
 *   CSRF defence for the admin's server actions.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
  maxAge: MAX_AGE_SECONDS,
} as const;

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

export async function createSession(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret());
}

/**
 * Fails closed on every path: no token, bad signature, expired, wrong claim, or
 * no secret configured. A thrown `AUTH_SECRET is not set` must not become an
 * authenticated request, so the throw is caught here rather than propagating.
 */
export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === 'admin';
  } catch {
    return false;
  }
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

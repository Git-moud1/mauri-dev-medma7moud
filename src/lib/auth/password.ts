import { verify } from '@node-rs/argon2';

/**
 * The stored hash, normalised.
 *
 * `ADMIN_PASSWORD_HASH` is expected to hold the **base64 of** an argon2id hash,
 * not the hash itself, and that is not paranoia — it is a measured workaround.
 *
 * An argon2 hash starts `$argon2id$v=19$m=19456,t=2,p=1$…`, and `@next/env`
 * runs dotenv-expand over every `.env` file. Every `$name` in the value is
 * treated as a variable reference and expanded to nothing, so the hash arrives
 * as `=19=19456,t=2,p=1…` and every login fails with "Incorrect password".
 * Verified against `@next/env` directly: plain, double-quoted, single-quoted and
 * backslash-escaped forms are **all** mangled. There is no quoting that
 * survives.
 *
 * Netlify's dashboard does no such expansion, so a raw hash set there works —
 * which is exactly what makes this a nasty bug to find: it breaks locally and
 * works in production. A raw value is therefore still accepted, so a variable
 * set by hand in the dashboard does not silently fail.
 *
 * TEMPORARY: `export` is for `./diagnostics`. Make this private again when the
 * diagnostics are removed.
 */
export function storedHash(): string | null {
  const raw = process.env.ADMIN_PASSWORD_HASH;
  if (!raw) return null;
  if (raw.startsWith('$argon2')) return raw;

  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return decoded.startsWith('$argon2') ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Verify a candidate password against the argon2id hash in the environment.
 *
 * Fails closed on every path: a missing hash, a malformed hash, an empty
 * candidate, or a thrown verifier all return false. The one outcome that must
 * never happen is a missing `ADMIN_PASSWORD_HASH` being read as "no password
 * required", which is what a naive `hash === candidate` check does when both
 * sides are undefined.
 *
 * argon2's verify is constant-time with respect to the stored hash, so there is
 * no string comparison to hand-roll here and no timing signal to leak.
 *
 * The plaintext password exists nowhere in this repository, this build, or any
 * environment variable — only the hash is ever deployed.
 */
export async function verifyPassword(candidate: string): Promise<boolean> {
  const hash = storedHash();
  if (!hash || candidate.length === 0) return false;

  try {
    return await verify(hash, candidate);
  } catch {
    return false;
  }
}

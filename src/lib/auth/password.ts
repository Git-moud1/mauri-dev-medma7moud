import { hash, verify } from '@node-rs/argon2';

/**
 * The hash from `ADMIN_PASSWORD_HASH`, normalised — the BOOTSTRAP credential.
 *
 * It is the admin password until the first password change or reset. From then
 * on the stored credential (src/lib/auth/credential.ts) is authoritative and
 * this variable is ignored — otherwise the old password would keep working
 * after it was changed.
 *
 * The variable is expected to hold the **base64 of** an argon2id hash, not the
 * hash itself, and that is not paranoia — it is a measured workaround.
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
 */
export function bootstrapHash(): string | null {
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
 * Verify a candidate password against an argon2 hash.
 *
 * Fails closed on every path: a missing hash, a malformed hash, an empty
 * candidate, or a thrown verifier all return false. The one outcome that must
 * never happen is a missing hash being read as "no password required", which
 * is what a naive `hash === candidate` check does when both sides are
 * undefined.
 *
 * argon2's verify is constant-time with respect to the stored hash, so there is
 * no string comparison to hand-roll here and no timing signal to leak.
 */
export async function verifyAgainst(
  storedHash: string | null | undefined,
  candidate: string,
): Promise<boolean> {
  if (!storedHash || candidate.length === 0) return false;

  try {
    return await verify(storedHash, candidate);
  } catch {
    return false;
  }
}

/**
 * Argon2id at the library defaults (m=19456 KiB, t=2, p=1 — the OWASP
 * recommendation), the same parameters `scripts/gen-admin-secrets.mjs` uses.
 * Only this hash is ever stored; the plaintext exists for the length of one
 * request.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

const COMMON = [
  'password',
  'motdepasse',
  'mauridev',
  'mauri-dev',
  'qwerty',
  'azerty',
  '123456',
  'admin',
];

/**
 * The new-password policy, shared by "change password" and "reset password".
 * Returns the problem in words, or null when the password is acceptable.
 *
 * Length is what matters most against an offline attack on an argon2 hash, so
 * a long passphrase is accepted on length alone; a shorter password has to mix
 * character classes. No external list or library: the obvious words are
 * refused here, and argon2's cost does the rest.
 */
export function newPasswordProblem(next: string, confirm: string): string | null {
  if (next !== confirm) return 'The two new passwords do not match.';
  if (next.length < 12) return 'Use at least 12 characters.';
  if (next.length > 200) return 'Use at most 200 characters.';
  if (/^(.)\1+$/.test(next)) return 'That password is a single repeated character.';

  const lower = next.toLowerCase();
  if (COMMON.some((word) => lower.includes(word)) && next.length < 20) {
    return 'That password contains a common word — choose something less guessable.';
  }

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(next),
  ).length;
  if (next.length < 16 && classes < 3) {
    return 'Mix at least three of: lowercase, uppercase, digits, symbols — or use a passphrase of 16+ characters.';
  }
  return null;
}

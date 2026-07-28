import { verify } from '@node-rs/argon2';

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
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || candidate.length === 0) return false;

  try {
    return await verify(hash, candidate);
  } catch {
    return false;
  }
}

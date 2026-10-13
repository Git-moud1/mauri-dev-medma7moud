import 'server-only';
import { z } from 'zod';
import { adminAuthStore, ADMIN_AUTH_STORE, BlobWriteUnverifiedError } from '@/lib/blobs';
import { bootstrapHash } from './password';

/**
 * The admin credential: `admin-auth/credential.json`.
 *
 * ONE document holds both the password hash and the session version. A password
 * change writes them together in a single object write, so there is no state in
 * which the password changed but old sessions still pass, or the reverse —
 * Netlify Blobs has no multi-key transactions, and this design does not need
 * one.
 *
 * Before the first change or reset the document does not exist, and the
 * credential is the `ADMIN_PASSWORD_HASH` variable at session version 0. That
 * keeps the production password exactly as it is on the first deploy. The
 * first change creates the document with `onlyIfNew`; every later one replaces
 * it with `onlyIfMatch` on the etag it read.
 */

const KEY = 'credential.json';

const credentialSchema = z.object({
  v: z.literal(1),
  hash: z.string().startsWith('$argon2'),
  sessionVersion: z.number().int().min(0),
  updatedAt: z.string(),
});

export interface Credential {
  hash: string;
  sessionVersion: number;
  /** Where it came from: the stored document, or the bootstrap variable. */
  source: 'store' | 'env';
  /** The stored document's etag; absent for the bootstrap credential. */
  etag?: string;
}

/** A credential write that lost a race with another one. Nothing was written. */
export class CredentialConflictError extends Error {
  constructor() {
    super(
      'The password was changed by another request at the same time. Nothing was saved.',
    );
    this.name = 'CredentialConflictError';
  }
}

/**
 * The current credential, or null when there is none at all (no document and
 * no bootstrap variable) — which every caller treats as "nobody can sign in".
 *
 * A store error THROWS. Falling back to the variable on an error would let the
 * old password back in during an outage after it had been changed.
 */
export async function readCredential(): Promise<Credential | null> {
  const result = await adminAuthStore().getWithMetadata(KEY, { type: 'text' });
  if (result !== null) {
    let parsed: z.infer<typeof credentialSchema>;
    try {
      parsed = credentialSchema.parse(JSON.parse(result.data));
    } catch {
      throw new Error(
        `[auth] ${ADMIN_AUTH_STORE}/${KEY} is malformed. Sign-in is refused.`,
      );
    }
    return {
      hash: parsed.hash,
      sessionVersion: parsed.sessionVersion,
      source: 'store',
      etag: result.etag,
    };
  }

  const hash = bootstrapHash();
  return hash ? { hash, sessionVersion: 0, source: 'env' } : null;
}

/**
 * Replace the password and bump the session version in one conditional write,
 * then read it back. Returns the new session version.
 */
export async function replaceCredential(
  previous: Credential,
  newHash: string,
): Promise<number> {
  const store = adminAuthStore();
  const sessionVersion = previous.sessionVersion + 1;
  const body = JSON.stringify({
    v: 1,
    hash: newHash,
    sessionVersion,
    updatedAt: new Date().toISOString(),
  } satisfies z.infer<typeof credentialSchema>);

  let condition: { onlyIfMatch: string } | { onlyIfNew: true };
  if (previous.source === 'env') {
    condition = { onlyIfNew: true };
  } else if (previous.etag) {
    condition = { onlyIfMatch: previous.etag };
  } else {
    throw new BlobWriteUnverifiedError(ADMIN_AUTH_STORE, KEY, 'read without an etag');
  }

  // `set` with a string, never `setJSON` — see BlobWriteUnverifiedError.
  const result = await store.set(KEY, body, condition);
  if (!result.modified) throw new CredentialConflictError();
  if (!result.etag) throw new BlobWriteUnverifiedError(ADMIN_AUTH_STORE, KEY, 'no etag');

  const check = await store.getWithMetadata(KEY, { type: 'text' });
  if (check === null || check.etag !== result.etag || check.data !== body) {
    throw new BlobWriteUnverifiedError(
      ADMIN_AUTH_STORE,
      KEY,
      'the stored credential differs',
    );
  }
  return sessionVersion;
}

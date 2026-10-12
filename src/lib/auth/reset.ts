import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminAuthStore, ADMIN_AUTH_STORE, BlobWriteUnverifiedError } from '@/lib/blobs';

/**
 * Password-reset tokens: `admin-auth/reset.json`.
 *
 * - 32 random bytes from the OS CSPRNG, base64url — 256 bits.
 * - Only the SHA-256 of the token is stored. The token itself exists in the
 *   email and nowhere else; a leaked store does not yield a usable link.
 * - One live token at a time. Issuing a new one overwrites the document, which
 *   invalidates any earlier link.
 * - 20 minutes to live.
 * - Single use, and this is the part that rests on the storage API: consuming
 *   rewrites the document with `consumedAt` set, conditional on the etag that
 *   was read (`If-Match`). Two requests racing with the same token read the
 *   same etag; Netlify Blobs accepts the first conditional write and answers
 *   412 to the second. That is the whole guarantee — it is exactly as strong as
 *   Netlify's conditional-write semantics, no stronger.
 */

const KEY = 'reset.json';
const TTL_MS = 20 * 60 * 1000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

interface ResetDoc {
  v: 1;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function parseDoc(text: string): ResetDoc | null {
  try {
    const doc = JSON.parse(text) as Partial<ResetDoc>;
    if (
      doc.v !== 1 ||
      typeof doc.tokenHash !== 'string' ||
      typeof doc.expiresAt !== 'number' ||
      typeof doc.createdAt !== 'number'
    ) {
      return null;
    }
    return {
      v: 1,
      tokenHash: doc.tokenHash,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt,
      consumedAt: typeof doc.consumedAt === 'number' ? doc.consumedAt : null,
    };
  } catch {
    return null;
  }
}

/** Mint a token, store its hash, and return the token for the email. */
export async function issueResetToken(): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  const doc: ResetDoc = {
    v: 1,
    tokenHash: sha256(token).toString('hex'),
    createdAt: now,
    expiresAt: now + TTL_MS,
    consumedAt: null,
  };
  const body = JSON.stringify(doc);
  const store = adminAuthStore();
  const result = await store.set(KEY, body);
  if (!result.etag) throw new BlobWriteUnverifiedError(ADMIN_AUTH_STORE, KEY, 'no etag');

  const check = await store.get(KEY, { type: 'text' });
  if (check !== body) {
    throw new BlobWriteUnverifiedError(ADMIN_AUTH_STORE, KEY, 'the stored token differs');
  }
  return { token, expiresAt: doc.expiresAt };
}

/** Cheap shape check, so garbage never reaches the store. */
export function isTokenShaped(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

/**
 * Mark the token used, if — and only if — it is the live, unexpired, unused
 * token. Returns false for every other case without saying which: a wrong,
 * expired, already-used or raced token all look the same to the caller.
 */
export async function consumeResetToken(token: string): Promise<boolean> {
  if (!isTokenShaped(token)) return false;

  const store = adminAuthStore();
  const result = await store.getWithMetadata(KEY, { type: 'text' });
  if (result === null || !result.etag) return false;

  const doc = parseDoc(result.data);
  if (!doc || doc.consumedAt !== null || Date.now() >= doc.expiresAt) return false;

  const presented = sha256(token);
  const stored = Buffer.from(doc.tokenHash, 'hex');
  if (stored.length !== presented.length || !timingSafeEqual(stored, presented))
    return false;

  const consumed = JSON.stringify({ ...doc, consumedAt: Date.now() } satisfies ResetDoc);
  const write = await store.set(KEY, consumed, { onlyIfMatch: result.etag });
  // Not modified: another request consumed (or replaced) it first. No etag:
  // the SDK reports success on non-412 errors, so an unconfirmed write is not
  // treated as ours.
  if (!write.modified || !write.etag) return false;

  const check = await store.getWithMetadata(KEY, { type: 'text' });
  return check !== null && check.etag === write.etag && check.data === consumed;
}

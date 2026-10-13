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
 * - Valid for 5 minutes (the owner's choice).
 * - The link may be OPENED at most twice: each load of the reset page counts
 *   one open. A third open, even inside the 5 minutes, is refused.
 * - It sets a password at most ONCE.
 *
 * Every state change — an open, the final use — is a rewrite of the document
 * conditional on the etag that was read (`If-Match`). Two requests racing read
 * the same etag; Netlify Blobs accepts the first conditional write and answers
 * 412 to the second. That is the whole guarantee against double counting and
 * double use — exactly as strong as Netlify's conditional-write semantics, no
 * stronger.
 */

const KEY = 'reset.json';
export const RESET_TTL_MS = 5 * 60 * 1000;
export const RESET_MAX_OPENS = 2;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

interface ResetDoc {
  v: 2;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  opens: number;
  consumedAt: number | null;
}

/** Why a link cannot be used — shown to the owner in words. */
export type LinkProblem = 'invalid' | 'expired' | 'used' | 'too-many-opens';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function parseDoc(text: string): ResetDoc | null {
  try {
    const doc = JSON.parse(text) as Partial<ResetDoc>;
    if (
      doc.v !== 2 ||
      typeof doc.tokenHash !== 'string' ||
      typeof doc.expiresAt !== 'number' ||
      typeof doc.createdAt !== 'number' ||
      typeof doc.opens !== 'number'
    ) {
      return null;
    }
    return {
      v: 2,
      tokenHash: doc.tokenHash,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt,
      opens: doc.opens,
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
    v: 2,
    tokenHash: sha256(token).toString('hex'),
    createdAt: now,
    expiresAt: now + RESET_TTL_MS,
    opens: 0,
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

type Loaded =
  { ok: true; doc: ResetDoc; etag: string } | { ok: false; problem: LinkProblem };

/** The live document, if `token` is its token. Checks nothing else. */
async function load(token: string): Promise<Loaded> {
  if (!isTokenShaped(token)) return { ok: false, problem: 'invalid' };
  const result = await adminAuthStore().getWithMetadata(KEY, { type: 'text' });
  if (result === null || !result.etag) return { ok: false, problem: 'invalid' };

  const doc = parseDoc(result.data);
  if (!doc) return { ok: false, problem: 'invalid' };

  // Only the latest link is live; an older link's hash no longer matches and
  // reads as invalid, which is accurate.
  const presented = sha256(token);
  const stored = Buffer.from(doc.tokenHash, 'hex');
  if (stored.length !== presented.length || !timingSafeEqual(stored, presented)) {
    return { ok: false, problem: 'invalid' };
  }
  return { ok: true, doc, etag: result.etag };
}

/** Conditional rewrite plus read-back; false when another request won. */
async function rewrite(doc: ResetDoc, etag: string): Promise<boolean> {
  const store = adminAuthStore();
  const body = JSON.stringify(doc);
  const write = await store.set(KEY, body, { onlyIfMatch: etag });
  // Not modified: another request changed it first. No etag: the SDK reports
  // success on non-412 errors, so an unconfirmed write is not treated as ours.
  if (!write.modified || !write.etag) return false;
  const check = await store.getWithMetadata(KEY, { type: 'text' });
  return check !== null && check.etag === write.etag && check.data === body;
}

/**
 * Count one opening of the link. Returns when it expires, or why it cannot be
 * opened. Called once per load of the reset page.
 */
export async function openResetToken(
  token: string,
): Promise<
  { ok: true; expiresAt: number; opensLeft: number } | { ok: false; problem: LinkProblem }
> {
  const loaded = await load(token);
  if (!loaded.ok) return loaded;
  const { doc, etag } = loaded;

  if (doc.consumedAt !== null) return { ok: false, problem: 'used' };
  if (Date.now() >= doc.expiresAt) return { ok: false, problem: 'expired' };
  if (doc.opens >= RESET_MAX_OPENS) return { ok: false, problem: 'too-many-opens' };

  const next: ResetDoc = { ...doc, opens: doc.opens + 1 };
  // A lost race is another open happening at the same moment; it counted
  // instead of this one, so this one is refused rather than retried.
  if (!(await rewrite(next, etag))) return { ok: false, problem: 'too-many-opens' };
  return { ok: true, expiresAt: doc.expiresAt, opensLeft: RESET_MAX_OPENS - next.opens };
}

/**
 * Use the link to set a password: only if it was opened (1–2 times), is
 * unexpired and unused. Marks it used in the same conditional write.
 */
export async function consumeResetToken(
  token: string,
): Promise<{ ok: true } | { ok: false; problem: LinkProblem }> {
  const loaded = await load(token);
  if (!loaded.ok) return loaded;
  const { doc, etag } = loaded;

  if (doc.consumedAt !== null) return { ok: false, problem: 'used' };
  if (Date.now() >= doc.expiresAt) return { ok: false, problem: 'expired' };
  if (doc.opens < 1 || doc.opens > RESET_MAX_OPENS)
    return { ok: false, problem: 'invalid' };

  if (!(await rewrite({ ...doc, consumedAt: Date.now() }, etag))) {
    return { ok: false, problem: 'used' };
  }
  return { ok: true };
}

import 'server-only';
import { getStore, type Store } from '@netlify/blobs';

/**
 * Which set of Blob stores this build talks to.
 *
 * Netlify Blobs site stores are shared by every deploy of the site: a deploy
 * preview, a branch deploy and production all see the same `site-content`
 * unless something keeps them apart. An admin save on a preview would then
 * rewrite the live catalogue. This prefix is that something.
 *
 * It is decided at BUILD time from Netlify's `CONTEXT` variable and inlined by
 * next.config.mjs (`env.MD_BLOBS_NAMESPACE`), so a deploy cannot change stores
 * after it is built:
 *
 *   production                       → ''          site-content, site-media, …
 *   deploy-preview / branch-deploy   → 'staging-'  staging-site-content, …
 *   anything else, including local   → 'local-'    local-site-content, …
 *
 * Production is the only context that reaches the unprefixed stores, and it has
 * to be named explicitly to get there. A missing or unexpected value lands on
 * `local-`, never on production.
 */
export const BLOBS_NAMESPACE: string = process.env.MD_BLOBS_NAMESPACE ?? 'local-';

/** Project records and site settings. */
export const CONTENT_STORE = `${BLOBS_NAMESPACE}site-content`;
/** Uploaded images, keyed exactly as the `/api/media/<key>` URLs spell them. */
export const MEDIA_STORE = `${BLOBS_NAMESPACE}site-media`;
/** Failed-login counters for the admin rate limiter. */
export const AUTH_ATTEMPTS_STORE = `${BLOBS_NAMESPACE}auth-attempts`;
/** The admin credential, the password-reset token, and (non-production only) the outbox. */
export const ADMIN_AUTH_STORE = `${BLOBS_NAMESPACE}admin-auth`;

/**
 * Strong consistency for everything that is read in order to be written back,
 * and for the public pages' reads.
 *
 * The default, eventual, can serve a value up to 60 seconds old after an
 * update. For the content store that is a real bug, not a delay: a save calls
 * `updateTag`, the next visitor triggers the re-render, and if that render read
 * the previous value it would be cached as the new page until the next edit.
 */
export function contentStore(): Store {
  return getStore({ name: CONTENT_STORE, consistency: 'strong' });
}

/**
 * Eventual is enough here: media keys are content-addressed and never
 * rewritten, and a new key is readable as soon as its write returns.
 * The upload path still reads back with strong consistency to verify.
 */
export function mediaStore(): Store {
  return getStore({ name: MEDIA_STORE });
}

export function authAttemptsStore(): Store {
  return getStore({ name: AUTH_ATTEMPTS_STORE, consistency: 'strong' });
}

/** Strong: a stale credential read could accept a password that was just changed. */
export function adminAuthStore(): Store {
  return getStore({ name: ADMIN_AUTH_STORE, consistency: 'strong' });
}

/**
 * True when the runtime has no Blobs context: `next dev` / `next start` without
 * NETLIFY_BLOBS_CONTEXT, or a build. The SDK reads that one variable and nothing
 * else — not NETLIFY_SITE_ID, not NETLIFY_AUTH_TOKEN — so a local process cannot
 * reach a real site's stores by accident.
 */
export function isMissingBlobsEnvironment(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'MissingBlobsEnvironmentError' ||
      /not been configured to use Netlify Blobs/i.test(error.message))
  );
}

/**
 * Write confirmation that does not trust the SDK's own answer.
 *
 * Measured against the installed @netlify/blobs 10.7.10:
 *
 * - `setJSON(key, value, { onlyIfMatch })` never sends the `If-Match` header.
 *   It spreads the condition into the wrong request field, so the write is
 *   unconditional while it still reports `{ modified: true }`. Every
 *   conditional write in this project therefore goes through `set()` with a
 *   pre-serialised string, which does send the header.
 * - A conditional `set()` reports `{ modified: true }` for ANY status other
 *   than 412, including a 401 or a 500. Only a missing etag gives that away.
 *
 * So a write counts as done only when the store hands back an etag AND a
 * strongly consistent read returns that etag with the bytes that were sent.
 */
export class BlobWriteUnverifiedError extends Error {
  constructor(store: string, key: string, reason: string) {
    super(
      `[blobs] ${store}/${key}: the write could not be confirmed (${reason}). ` +
        'Nothing was reported as saved. Reload and check before retrying.',
    );
    this.name = 'BlobWriteUnverifiedError';
  }
}

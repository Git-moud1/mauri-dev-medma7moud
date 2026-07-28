import { unstable_cache } from 'next/cache';
import { blobStore } from './blobs';

/**
 * Cache tag for everything the admin can edit. Every write calls
 * `revalidateTag(CONTENT_TAG)`, which is what makes a change appear on the
 * public site without a redeploy.
 */
export const CONTENT_TAG = 'content';

/**
 * Bump this when the *bundled fallback data* changes.
 *
 * `unstable_cache` entries are keyed by the array below and persist in
 * `.next/cache`, which Netlify restores between builds for speed. A code change
 * to the fallback therefore does NOT invalidate them: a stale entry survives the
 * deploy and the old value keeps rendering. Observed locally — editing the hero
 * stacks figure changed nothing until `.next/cache` was deleted.
 *
 * Runtime writes are unaffected; they call `updateTag(CONTENT_TAG)` and expire
 * immediately. This exists only for the case where the fallback itself moves.
 */
const CACHE_VERSION = 'v2';

/**
 * Reads are cached and tagged so the public routes stay statically prerendered
 * between edits. Without the cache wrapper the Blobs call would be request-time
 * data and Next would flip `/[locale]` to dynamic, which forfeits the CDN HTML
 * the whole architecture is built on — check the build output for `SSG` after
 * changing anything here.
 */
export const getProjects = unstable_cache(
  () => blobStore.getProjects(),
  ['content:projects', CACHE_VERSION],
  {
    tags: [CONTENT_TAG],
  },
);

export const getSettings = unstable_cache(
  () => blobStore.getSettings(),
  ['content:settings', CACHE_VERSION],
  {
    tags: [CONTENT_TAG],
  },
);

export { blobStore };
export * from './types';

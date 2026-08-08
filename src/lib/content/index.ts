import { unstable_cache } from 'next/cache';
import { supabaseStore } from './supabase';

/**
 * Cache tag for everything the admin can edit. Every write calls
 * `updateTag(CONTENT_TAG)`, which is what makes a change appear on the public
 * site without a redeploy.
 */
export const CONTENT_TAG = 'content';

/**
 * Bump this when the shape or the source of the cached data changes.
 *
 * `unstable_cache` entries are keyed by the array below and persist in
 * `.next/cache`, which Netlify restores between builds for speed. A code change
 * to the reader therefore does NOT invalidate them: a stale entry survives the
 * deploy and the old value keeps rendering. Observed locally — editing the hero
 * stacks figure changed nothing until `.next/cache` was deleted.
 *
 * v3 is the move off Netlify Blobs. Without this bump the first deploy after
 * the migration would restore a cache full of entries written by the old store
 * and serve exactly the stale content the migration exists to stop.
 */
const CACHE_VERSION = 'v3';

/**
 * Reads are cached and tagged so the public routes stay statically prerendered
 * between edits. Without the cache wrapper the Supabase call would be
 * request-time data and Next would flip `/[locale]` to dynamic, which forfeits
 * the CDN HTML the whole architecture is built on — check the build output for
 * `SSG` after changing anything here.
 *
 * A read that fails throws, and the build fails with it. That is deliberate:
 * see the comment at the top of ./supabase.
 */
export const getProjects = unstable_cache(
  () => supabaseStore.getProjects(),
  ['content:projects', CACHE_VERSION],
  {
    tags: [CONTENT_TAG],
  },
);

export const getSettings = unstable_cache(
  () => supabaseStore.getSettings(),
  ['content:settings', CACHE_VERSION],
  {
    tags: [CONTENT_TAG],
  },
);

export { supabaseStore };
export * from './types';

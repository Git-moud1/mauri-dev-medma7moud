import { unstable_cache } from 'next/cache';
import { blobsStore } from './blobs';

/**
 * Cache tag for everything the admin can edit. Every write calls
 * `updateTag(CONTENT_TAG)`, which is what makes a change appear on the public
 * site without a redeploy.
 */
export const CONTENT_TAG = 'content';

/**
 * Bump this when the shape or the source of the cached data changes.
 *
 * `unstable_cache` entries are keyed by the array below and can outlive a code
 * change in a restored `.next/cache`, so a new reader has to name a new key or
 * it may be handed entries the old one wrote.
 *
 * v4 is the move from Supabase back to Netlify Blobs.
 */
const CACHE_VERSION = 'v4';

/**
 * Reads for the public pages, cached and tagged.
 *
 * These run at REQUEST time only. The public routes return no static params
 * (see `generateStaticParams` in `[locale]/layout.tsx`), so `next build` renders
 * none of them and never calls these. The first visit after a deploy renders
 * the page inside the Netlify function, where the Blobs context exists, and the
 * result is cached until the next `updateTag`.
 *
 * That ordering is the fix for the bug that took the site off Blobs in the
 * first place: the build container has no Blobs context, every prerender read
 * failed, and the bundled fallback was baked into the HTML. With no build-time
 * read there is nothing to fail and nothing to fall back to.
 *
 * A read that fails throws, and the request errors. It is never papered over.
 */
export const getProjects = unstable_cache(
  () => blobsStore.getProjects(),
  ['content:projects', CACHE_VERSION],
  { tags: [CONTENT_TAG] },
);

export const getSettings = unstable_cache(
  () => blobsStore.getSettings(),
  ['content:settings', CACHE_VERSION],
  { tags: [CONTENT_TAG] },
);

export { blobsStore, versionOf, ContentConflictError } from './blobs';
export * from './types';

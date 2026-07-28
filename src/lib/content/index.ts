import { unstable_cache } from 'next/cache';
import { blobStore } from './blobs';

/**
 * Cache tag for everything the admin can edit. Every write calls
 * `revalidateTag(CONTENT_TAG)`, which is what makes a change appear on the
 * public site without a redeploy.
 */
export const CONTENT_TAG = 'content';

/**
 * Reads are cached and tagged so the public routes stay statically prerendered
 * between edits. Without the cache wrapper the Blobs call would be request-time
 * data and Next would flip `/[locale]` to dynamic, which forfeits the CDN HTML
 * the whole architecture is built on — check the build output for `SSG` after
 * changing anything here.
 */
export const getProjects = unstable_cache(
  () => blobStore.getProjects(),
  ['content:projects'],
  {
    tags: [CONTENT_TAG],
  },
);

export const getSettings = unstable_cache(
  () => blobStore.getSettings(),
  ['content:settings'],
  {
    tags: [CONTENT_TAG],
  },
);

export { blobStore };
export * from './types';

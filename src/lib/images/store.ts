/**
 * Where uploaded binaries live.
 *
 * Its own module because a `'use server'` file may only export async functions
 * — exporting this constant from the upload action failed the build — and the
 * media route needs the same name.
 */
export const MEDIA_STORE = 'site-media';

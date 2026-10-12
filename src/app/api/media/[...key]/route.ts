import { getMedia } from '@/lib/images/store';

/**
 * Serves an uploaded image out of Netlify Blobs.
 *
 * Public and unauthenticated by design: these are portfolio screenshots meant
 * to be seen. The admin surface controls what gets *written* here, not who can
 * read it.
 *
 * Keys are content-addressed — project, slug, timestamp, width — so a given URL
 * never changes content and can be cached immutably. Replacing an image mints a
 * new key. That is also why every `/api/media/...` URL already stored in a
 * project record resolves unchanged: the keys in the store are those strings.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key } = await context.params;
  const path = key.join('/');

  // The key comes from the URL, so it is untrusted: refuse anything that is not
  // the exact shape this route writes, rather than trying to sanitise it.
  if (!/^[a-z0-9-]+\/[a-z0-9-]+-\d+\.webp$/.test(path)) {
    return notFound();
  }

  let data: ArrayBuffer | null;
  try {
    data = await getMedia(path);
  } catch {
    // Unlike the content reads, a broken image stays a 404 rather than a 500.
    // A page with one missing screenshot is worth serving; the loud failure
    // that matters is the one on the data the page is built from. Not cached,
    // so the image comes back on its own once the store does.
    return notFound();
  }
  if (data === null) return notFound();

  return new Response(data, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      // `durable` puts the response in Netlify's shared CDN cache, so each image
      // invokes this function roughly once per deploy rather than once per edge
      // node. Every invocation costs compute credits on the free plan.
      'Netlify-CDN-Cache-Control': 'public, durable, max-age=31536000, immutable',
    },
  });
}

/**
 * Never cached anywhere: a 404 cached for a year would outlive the upload that
 * fixes it.
 */
function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}

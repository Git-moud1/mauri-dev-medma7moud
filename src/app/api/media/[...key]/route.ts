import { getStore } from '@netlify/blobs';
import { MEDIA_STORE } from '@/lib/images/store';

/**
 * Serves an uploaded image out of Netlify Blobs.
 *
 * Public and unauthenticated by design: these are portfolio screenshots meant
 * to be seen. The admin surface controls what gets *written* here, not who can
 * read it.
 *
 * Keys are content-addressed — project, slug, timestamp, width — so a given URL
 * never changes content and can be cached immutably. Replacing an image mints a
 * new key.
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
    return new Response('Not found', { status: 404 });
  }

  try {
    const blob = await getStore(MEDIA_STORE).get(path, { type: 'arrayBuffer' });

    // The types promise an ArrayBuffer, but a missing key returns null at
    // runtime. Reading `byteLength` off it throws, and the catch below turns
    // that into the 404 it should have been — which is also what happens when
    // there is no Blobs runtime at all.
    if (blob.byteLength === 0) return new Response('Not found', { status: 404 });

    return new Response(blob, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    // A missing store is a 404 rather than a 500: locally there is no Blobs
    // runtime at all, and a broken image is a better failure than a stack trace.
    return new Response('Not found', { status: 404 });
  }
}

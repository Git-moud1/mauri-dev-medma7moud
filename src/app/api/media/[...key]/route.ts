import { supabase, MEDIA_BUCKET } from '@/lib/supabase';

/**
 * Serves an uploaded image out of Supabase Storage.
 *
 * Public and unauthenticated by design: these are portfolio screenshots meant
 * to be seen. The admin surface controls what gets *written* here, not who can
 * read it.
 *
 * This route is the only reason the bucket can stay private. It reads with the
 * secret key server-side and proxies the bytes, so no signed URLs expire in the
 * middle of a page, the CSP stays `img-src 'self'`, and nothing in a browser
 * ever addresses Supabase directly.
 *
 * Object paths are byte-identical to the old Netlify Blobs keys, which is why
 * every `/api/media/...` URL already stored in a project record kept working
 * across the migration without rewriting any content.
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
    const { data, error } = await supabase().storage.from(MEDIA_BUCKET).download(path);

    // A missing object arrives as an error, not as a throw, and `data` is
    // non-null whenever `error` is null. Either way it is a 404 to a browser
    // asking for an image — this route cannot distinguish "never uploaded" from
    // "deleted", and neither needs a different answer.
    if (error) return new Response('Not found', { status: 404 });

    return new Response(data, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    // Unlike the content reads, a broken image stays a 404 rather than a 500.
    // A page with one missing screenshot is worth serving; the loud failure
    // that matters is the one on the data the page is built from.
    return new Response('Not found', { status: 404 });
  }
}

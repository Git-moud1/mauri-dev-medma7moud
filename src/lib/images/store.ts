import 'server-only';
import { createHash } from 'node:crypto';
import { mediaStore, MEDIA_STORE, BlobWriteUnverifiedError } from '@/lib/blobs';

/**
 * Uploaded images in Netlify Blobs.
 *
 * Keys are the exact strings the `/api/media/<key>` URLs in project records
 * spell — `al-sahel-store/chatgpt-image-…-800.webp` — which is why the fourteen
 * images recovered from this store resolve again with no record rewritten.
 */

/**
 * A copy of the bytes on a plain, unshared ArrayBuffer.
 *
 * This is the fix for the upload bug that filled the old store with garbage.
 * On the Netlify Linux runtime sharp hands back Buffers backed by a
 * SharedArrayBuffer. The SDK sends a body as a string, Blob or ArrayBuffer; a
 * SharedArrayBuffer is none of those, it was stringified, and the 26 bytes of
 * "[object SharedArrayBuffer]" were stored under the image's key while the
 * upload reported success. Six of those are still in the store.
 *
 * Copying into a fresh ArrayBuffer removes the dependency on what sharp happens
 * to allocate on a given platform. The read-back in `putMedia` is the proof.
 */
function toPlainArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Store one image, refusing to replace anything already under the key.
 *
 * Keys carry a timestamp, so an existing key means a bug, not a re-upload, and
 * overwriting it would change an image other records already point at — one
 * the media route serves as immutable.
 */
export async function putMedia(key: string, data: Uint8Array): Promise<void> {
  const store = mediaStore();
  const result = await store.set(key, toPlainArrayBuffer(data), { onlyIfNew: true });
  if (!result.modified) {
    throw new Error(`An image already exists at ${key}; nothing was overwritten.`);
  }
  if (!result.etag) {
    throw new BlobWriteUnverifiedError(MEDIA_STORE, key, 'no etag in the response');
  }

  // The check the old store never made. A corrupt write is caught here, before
  // a project record can point at it.
  // Typed by the SDK as never null, but a 404 returns null at runtime
  // (@netlify/blobs 10.7.10, Store.get). The cast restores the real type.
  const stored = (await store.get(key, {
    type: 'arrayBuffer',
    consistency: 'strong',
  })) as ArrayBuffer | null;
  if (stored === null) {
    throw new BlobWriteUnverifiedError(MEDIA_STORE, key, 'the image is not there');
  }
  const bytes = new Uint8Array(stored);
  if (bytes.byteLength !== data.byteLength || sha256(bytes) !== sha256(data)) {
    throw new BlobWriteUnverifiedError(
      MEDIA_STORE,
      key,
      `stored ${bytes.byteLength} bytes, sent ${data.byteLength}`,
    );
  }
}

/** The image bytes, or null when no object has that key. */
export async function getMedia(key: string): Promise<ArrayBuffer | null> {
  return mediaStore().get(key, { type: 'arrayBuffer' });
}

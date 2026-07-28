'use server';

import { getStore } from '@netlify/blobs';
import { requireSession } from '../actions';
import {
  processUpload,
  mediaKey,
  slugifyFilename,
  MAX_UPLOAD_BYTES,
} from '@/lib/images/process';
import { MEDIA_STORE } from '@/lib/images/store';

/** FormDataEntryValue is `string | File`; a File stringifies to "[object File]". */
function fieldString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export type UploadResult =
  { ok: true; path: string; blurDataURL: string } | { ok: false; error: string };

/**
 * Accept one image, re-encode it, store every width, and hand back the public
 * path the project record will hold.
 *
 * One file per call rather than a batch: the media grid shows per-file progress
 * and a per-file error, and a batch endpoint would collapse "the third of five
 * was corrupt" into one failure for all of them.
 *
 * The returned `path` points at the media route, not at a blob key — the
 * project record stores a URL the public site can render directly.
 */
export async function uploadImage(formData: FormData): Promise<UploadResult> {
  if (!(await requireSession())) return { ok: false, error: 'Not signed in.' };

  const projectId = fieldString(formData, 'projectId');
  if (!/^[a-z0-9-]+$/.test(projectId)) {
    return { ok: false, error: 'Save the project id first, then add images.' };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'No file received.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let processed;
  try {
    processed = await processUpload(buffer);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid image.',
    };
  }

  // Suffixed with the time so re-uploading a file of the same name produces a
  // new key rather than overwriting one that is already cached immutably.
  const slug = `${slugifyFilename(file.name)}-${Date.now().toString(36)}`;

  try {
    const store = getStore(MEDIA_STORE);
    await Promise.all(
      processed.widths.map(async (variant) => {
        // Blobs takes an ArrayBuffer, not a Node Buffer. `.slice()` on the
        // underlying buffer copies exactly this view's bytes — passing
        // `variant.data.buffer` directly would upload sharp's whole pooled
        // allocation, which is larger than the image and full of other data.
        const bytes = variant.data.buffer.slice(
          variant.data.byteOffset,
          variant.data.byteOffset + variant.data.byteLength,
        ) as ArrayBuffer;
        await store.set(mediaKey(projectId, slug, variant.width), bytes);
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/blob|store|environment/i.test(message)) {
      return {
        ok: false,
        error:
          'Uploads need the Netlify runtime. Run `npx netlify dev` locally, or upload on the deploy.',
      };
    }
    return { ok: false, error: `Upload failed: ${message}` };
  }

  const widest = processed.widths.reduce((a, b) => (a.width > b.width ? a : b));

  return {
    ok: true,
    path: `/api/media/${mediaKey(projectId, slug, widest.width)}`,
    blurDataURL: processed.blurDataURL,
  };
}

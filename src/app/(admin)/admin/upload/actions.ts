'use server';

import { requireSession } from '../actions';
import { processUpload, mediaKey, slugifyFilename } from '@/lib/images/process';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@/lib/images/limits';
import { supabase, MEDIA_BUCKET } from '@/lib/supabase';

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
      error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_LABEL}.`,
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
    const storage = supabase().storage.from(MEDIA_BUCKET);
    await Promise.all(
      processed.widths.map(async (variant) => {
        // A Node Buffer goes straight over the wire: Storage takes binary
        // bodies, so there is nothing to convert.
        //
        // Worth knowing why that matters, because the deleted conversion cost
        // this project a store full of garbage. Netlify Blobs' `set` accepted
        // `string | ArrayBuffer | Blob`, and on the Netlify Linux runtime
        // sharp's output is backed by a SharedArrayBuffer — no branch matched,
        // it fell through to `String(value)`, and 26 bytes of "[object
        // SharedArrayBuffer]" were written under every media key while the
        // upload reported success. Locally the same code produced a plain
        // ArrayBuffer and worked, so no local test could have caught it. Six of
        // those corpses were still in the store at migration time.
        const { error } = await storage.upload(
          mediaKey(projectId, slug, variant.width),
          variant.data,
          { contentType: 'image/webp', cacheControl: '31536000', upsert: false },
        );
        // Unlike the migration script, this must NOT upsert: keys carry a
        // timestamp, so a collision means a bug, not a re-run, and silently
        // overwriting would replace an image other records already point at.
        if (error) throw new Error(error.message);
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/SUPABASE_URL|SUPABASE_SECRET_KEY/.test(message)) {
      return {
        ok: false,
        error:
          'Image storage is not configured — SUPABASE_URL and SUPABASE_SECRET_KEY are missing. ' +
          'Locally: fill in .env.local. On Netlify: Site configuration → Environment variables.',
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

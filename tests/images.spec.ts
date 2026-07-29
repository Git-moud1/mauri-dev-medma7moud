import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import {
  sniffImageType,
  processUpload,
  slugifyFilename,
  mediaKey,
  toArrayBuffer,
  MAX_UPLOAD_BYTES,
} from '../src/lib/images/process';

async function png(width = 800, height = 600): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 200 } },
  })
    .png()
    .toBuffer();
}

test.describe('upload processing', () => {
  test('sniffs a real PNG from its magic bytes', async () => {
    expect(sniffImageType(await png())).toBe('png');
  });

  test('sniffs a real JPEG', async () => {
    expect(
      sniffImageType(
        await sharp(await png())
          .jpeg()
          .toBuffer(),
      ),
    ).toBe('jpeg');
  });

  test('sniffs a real WebP', async () => {
    expect(
      sniffImageType(
        await sharp(await png())
          .webp()
          .toBuffer(),
      ),
    ).toBe('webp');
  });

  /**
   * The filename and the client-sent MIME type are attacker-controlled. Only
   * the bytes are not, which is why nothing else is consulted.
   */
  test('rejects a file whose bytes are not an image', () => {
    expect(sniffImageType(Buffer.from('<?php system($_GET["c"]); ?>'))).toBeNull();
  });

  test('rejects an SVG, whatever it claims to be', () => {
    expect(
      sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    ).toBeNull();
  });

  test('re-encodes to webp at multiple widths and produces a blur placeholder', async () => {
    const result = await processUpload(await png(1600, 1200));
    expect(result.widths.length).toBeGreaterThan(1);
    expect(result.blurDataURL).toMatch(/^data:image\/webp;base64,/);
    for (const variant of result.widths) {
      expect(sniffImageType(variant.data)).toBe('webp');
    }
  });

  /**
   * Re-encoding is what strips EXIF. That is a security property — a phone
   * photo carries GPS coordinates — not a size optimisation.
   */
  test('strips EXIF from the re-encoded output', async () => {
    const withExif = await sharp(await png())
      .withMetadata({ exif: { IFD0: { Copyright: 'location-data-goes-here' } } })
      .jpeg()
      .toBuffer();

    const result = await processUpload(withExif);
    const first = result.widths[0];
    if (!first) throw new Error('no variants produced');

    const metadata = await sharp(first.data).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  test('rejects an oversized buffer before decoding it', async () => {
    await expect(processUpload(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toThrow(
      /too large/i,
    );
  });

  test('rejects an image past the dimension cap', async () => {
    await expect(processUpload(await png(4200, 100))).rejects.toThrow(/too large/i);
  });

  test('slugifies a filename into something key-safe', () => {
    expect(slugifyFilename('My Photo (final).JPG')).toBe('my-photo-final');
    expect(slugifyFilename('....')).toBe('image');
    expect(slugifyFilename('café-münchen.png')).toBe('caf-m-nchen');
  });

  test('media keys are namespaced by project and width', () => {
    expect(mediaKey('skin-beauty', 'cover', 800)).toBe('skin-beauty/cover-800.webp');
  });

  /**
   * `.jfif` is not a format. JFIF is the ordinary JPEG container, so a `.jfif`
   * file is a JPEG with a less common extension — which is why the sniffer must
   * never have been the thing rejecting it, and why nothing here passes a name.
   */
  test('a JFIF-marked JPEG sniffs as jpeg regardless of its extension', async () => {
    const jpeg = await sharp(await png()).jpeg().toBuffer();
    expect(sniffImageType(jpeg)).toBe('jpeg');

    // The APP0 'JFIF\0' segment spelled out, in case sharp ever stops emitting
    // it: this is the exact byte sequence a `.jfif` from an old camera carries.
    const app0 = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      Buffer.from('JFIF\0', 'ascii'),
      jpeg.subarray(2),
    ]);
    expect(sniffImageType(app0)).toBe('jpeg');
  });

  test('a JFIF-marked JPEG processes end to end', async () => {
    const result = await processUpload(await sharp(await png()).jpeg().toBuffer());
    expect(result.widths.length).toBeGreaterThan(0);
    expect(result.blurDataURL).toMatch(/^data:image\/webp;base64,/);
  });

  test('sniffs a real AVIF', async () => {
    expect(
      sniffImageType(await sharp(await png(64, 64)).avif({ effort: 0 }).toBuffer()),
    ).toBe('avif');
  });

  test('a buffer too short to hold a signature is not an image', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  /** A genuinely unsupported format must say what *is* supported. */
  test('rejects a GIF with a message naming the accepted formats', async () => {
    const gif = await sharp(await png(32, 32)).gif().toBuffer();
    await expect(processUpload(gif)).rejects.toThrow(/JPEG, PNG, WebP or AVIF/);
  });
});

/**
 * The bytes actually handed to Netlify Blobs.
 *
 * `store.set` takes `string | ArrayBuffer | Blob` and stringifies anything
 * else. On the Netlify Linux runtime sharp's output Buffer is backed by a
 * `SharedArrayBuffer`, which slicing preserves, so every media key was written
 * as the text `[object SharedArrayBuffer]` while the upload reported success.
 * Local sharp produces a plain `ArrayBuffer`, so the shared case is constructed
 * by hand here — otherwise this suite would pass on a machine where the bug is
 * invisible, which is exactly how it shipped.
 */
test.describe('blob payload conversion', () => {
  test('produces a real, unshared ArrayBuffer', async () => {
    const webp = await sharp(await png(64, 64)).webp().toBuffer();
    const out = toArrayBuffer(webp);

    expect(out).toBeInstanceOf(ArrayBuffer);
    expect(out.constructor.name).toBe('ArrayBuffer');
    expect(String(out)).not.toContain('Shared');
  });

  test('survives a Buffer backed by a SharedArrayBuffer', () => {
    const shared = new SharedArrayBuffer(8);
    new Uint8Array(shared).set([1, 2, 3, 4, 5, 6, 7, 8]);
    // The production shape: a view over shared memory, offset into the pool.
    const view = Buffer.from(shared as unknown as ArrayBuffer, 2, 4);
    expect(view.buffer.constructor.name).toBe('SharedArrayBuffer');

    const out = toArrayBuffer(view);
    expect(out.constructor.name).toBe('ArrayBuffer');
    expect(out.byteLength).toBe(4);
    expect([...new Uint8Array(out)]).toEqual([3, 4, 5, 6]);
  });

  test('copies only this view, not the whole pooled allocation', async () => {
    const webp = await sharp(await png(64, 64)).webp().toBuffer();
    expect(toArrayBuffer(webp).byteLength).toBe(webp.byteLength);
    expect(Buffer.from(toArrayBuffer(webp)).equals(webp)).toBe(true);
  });
});

/**
 * Three limits have to agree or uploads fail in a way the app cannot report.
 *
 * This is the regression guard for the bug this suite was extended for. Next
 * rejects a Server Action body over `serverActions.bodySizeLimit` with a 413
 * raised *before* the action runs, and Netlify drops a buffered function
 * request over 6 MB — base64 on the way in, so ~4.5 MB of actual file. Either
 * one fires and `uploadImage` never returns `{ ok: false }`; the caller gets a
 * rejected promise instead of a message. So the app's own ceiling must be the
 * lowest of the three, and that is what is asserted here rather than assumed.
 */
test.describe('upload size limits agree', () => {
  const NETLIFY_BINARY_REQUEST_CEILING = 4.5 * 1024 * 1024;

  function configuredBodySizeLimitBytes(): number {
    const source = readFileSync(resolve(process.cwd(), 'next.config.mjs'), 'utf8');
    const match = /bodySizeLimit:\s*'(\d+(?:\.\d+)?)(kb|mb)'/i.exec(source);
    if (!match) throw new Error('no serverActions.bodySizeLimit found in next.config.mjs');
    const [, size, unit] = match;
    return Number(size) * 1024 * (unit?.toLowerCase() === 'mb' ? 1024 : 1);
  }

  test("the app's limit is below Next's Server Action body limit", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(configuredBodySizeLimitBytes());
  });

  test("the app's limit is below Netlify's buffered binary request ceiling", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(NETLIFY_BINARY_REQUEST_CEILING);
  });
});

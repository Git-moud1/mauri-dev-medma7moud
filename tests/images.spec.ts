import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import {
  sniffImageType,
  processUpload,
  slugifyFilename,
  mediaKey,
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
});

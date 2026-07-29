import sharp from 'sharp';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from './limits';

export { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL };
export const MAX_DIMENSION = 4000;
const WIDTHS = [400, 800, 1200, 1600] as const;

export type ImageType = 'jpeg' | 'png' | 'webp' | 'avif';

/**
 * Identify a file from its leading bytes.
 *
 * The filename and the client-sent MIME type are both attacker-controlled and
 * neither is consulted. A file called `cover.jpg` with `image/jpeg` in the
 * multipart headers can contain anything at all.
 *
 * This is also what makes extension aliases a non-problem. `.jfif`, `.jpe` and
 * `.pjpeg` are JPEG — JFIF *is* the ordinary JPEG container — so they match the
 * `FF D8 FF` branch and always did. What rejected them was the file input's
 * `accept` list upstream, not this function; see MediaGrid.
 *
 * SVG is deliberately unsupported: it is a script container, and this is the
 * same reason `dangerouslyAllowSVG` was removed from next.config in plan 1.
 */
export function sniffImageType(buffer: Buffer): ImageType | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.subarray(0, 8).equals(png)) return 'png';

  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }

  if (
    buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
    buffer.subarray(8, 12).toString('ascii').startsWith('avif')
  ) {
    return 'avif';
  }

  return null;
}

export interface ProcessedImage {
  widths: { width: number; data: Buffer }[];
  blurDataURL: string;
}

/**
 * Re-encode an upload to WebP at several widths and produce an LQIP.
 *
 * Re-encoding is the security step, not the optimisation. It drops EXIF — which
 * carries GPS coordinates straight off a phone camera — and neutralises
 * anything appended to or embedded in the original container, because the
 * output is built from decoded pixels rather than copied bytes.
 *
 * Errors are thrown with messages written for the person uploading, since they
 * are rendered directly in the media grid.
 */
export async function processUpload(buffer: Buffer): Promise<ProcessedImage> {
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`Image is too large — the limit is ${MAX_UPLOAD_LABEL}.`);
  }
  if (!sniffImageType(buffer)) {
    throw new Error(
      'That file is not a JPEG, PNG, WebP or AVIF image — the contents are ' +
        'what is checked, not the file name.',
    );
  }

  const metadata = await sharp(buffer, {
    limitInputPixels: MAX_DIMENSION * MAX_DIMENSION,
  }).metadata();

  // A container sharp can open but whose dimensions it cannot report is not
  // something to guess at: every downstream step here is a function of width.
  const { width: sourceWidth, height: sourceHeight } = metadata;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('That image could not be read — it may be truncated.');
  }
  if (sourceWidth > MAX_DIMENSION || sourceHeight > MAX_DIMENSION) {
    throw new Error(
      `Image is too large — the limit is ${MAX_DIMENSION}px on either side.`,
    );
  }

  const targets = WIDTHS.filter((width) => width <= sourceWidth);
  const widths = await Promise.all(
    (targets.length > 0 ? targets : ([sourceWidth] as const)).map(async (width) => ({
      width,
      data: await sharp(buffer).resize({ width }).webp({ quality: 78 }).toBuffer(),
    })),
  );

  const blur = await sharp(buffer).resize({ width: 16 }).webp({ quality: 40 }).toBuffer();

  return {
    widths,
    blurDataURL: `data:image/webp;base64,${blur.toString('base64')}`,
  };
}

/**
 * Blob key for one width of one image.
 *
 * Content-addressed by project, slug and width, so replacing an image produces
 * a new key rather than overwriting one — which is what lets the media route
 * serve everything as immutable.
 */
export function mediaKey(projectId: string, slug: string, width: number): string {
  return `${projectId}/${slug}-${width}.webp`;
}

/** Filename → a key-safe slug. Never trusted for anything but naming. */
export function slugifyFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug.length > 0 ? slug : 'image';
}

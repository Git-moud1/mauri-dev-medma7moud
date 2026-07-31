// Generates the tab icon and the iOS home-screen icon from the brand logo.
// Output: src/app/icon.png (256), src/app/apple-icon.png (180).
// Run with:  node scripts/gen-icons.mjs
//
// The source logo is a 1080x720 landscape frame: a ring, the M mark inside it,
// and the "MAURI-DEV / DEVELOP SOLUTIONS" wordmark under the mark. None of that
// survives 16 CSS pixels, so the icon is the mark alone — cropped to its own
// bounding box (measured below, not eyeballed) and re-centred on the site's
// dark background. Cropping a square straight out of the source instead would
// drag arcs of the ring into the corners.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'public', 'mauri-dev.jpeg');
const appDir = join(root, 'src', 'app');

/**
 * Pure black, matching the logo's own background rather than the site's `#08080c`
 * surface. The crop carries the source's black with it, so anything else shows
 * the crop rectangle as a visible seam inside the icon.
 */
const BACKGROUND = { r: 0, g: 0, b: 0, alpha: 1 };

/**
 * Window around the mark that excludes the ring at every y it passes through.
 * The ring is the brightest thing in the frame, so a plain luminance scan over
 * the whole logo would return the ring's bounding box, not the mark's.
 */
const WINDOW = { left: 370, top: 130, width: 360, height: 250 };
/** Sum of the three channels. Above this is ink, below it is background glow. */
const INK = 330;

/** The mark's true bounding box, in source pixels. */
async function measureMark() {
  const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;

  for (let y = WINDOW.top; y < WINDOW.top + WINDOW.height; y++) {
    for (let x = WINDOW.left; x < WINDOW.left + WINDOW.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] + data[i + 1] + data[i + 2] <= INK) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error('No mark found in the crop window.');
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * The mark scaled to `1 - 2 * margin` of the canvas and centred on it.
 * `margin` is the breathing room browsers expect around a tab icon; without it
 * the mark's arrow tips touch the edge and read as clipped.
 */
async function render(mark, size, margin) {
  const box = Math.round(size * (1 - 2 * margin));
  const scaled = await sharp(source)
    .extract(mark)
    .resize({ width: box, height: box, fit: 'inside' })
    .png()
    .toBuffer();
  const { width, height } = await sharp(scaled).metadata();

  return sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([
      {
        input: scaled,
        left: Math.round((size - width) / 2),
        top: Math.round((size - height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

const mark = await measureMark();

// 256 rather than 32: browsers downscale for the tab and reuse the same file
// for bookmarks and the Android home screen, where 32 looks soft.
await sharp(await render(mark, 256, 0.14)).toFile(join(appDir, 'icon.png'));

// iOS draws its own rounded-rect mask and does not honour transparency, so the
// margin is wider here — the mask crops the corners of what it is given.
await sharp(await render(mark, 180, 0.18)).toFile(join(appDir, 'apple-icon.png'));

console.log(
  `Mark measured at ${mark.width}x${mark.height} (+${mark.left},${mark.top}) — wrote icon.png and apple-icon.png`,
);

/**
 * Builds the two textures concept A3 parallaxes: a photographic base image and
 * its depth map.
 *
 *   node scripts/gen-hero-depth.mjs
 *   → public/hero/a3-base.webp    1024×512, colour
 *   → public/hero/a3-depth.webp   1024×512, grayscale, white = near
 *
 * --- Why this is generated and not estimated -------------------------------
 *
 * The brief asks for a monocular depth model (Depth Anything V2 / MiDaS) rather
 * than a hand-painted map, *unless* the mockup is rendered in a 3D tool, in
 * which case the depth buffer should be exported directly because it will be
 * exact. That is the path taken here, and it is the better one: the phone is not
 * a photograph whose geometry has to be guessed back out of it — it is placed by
 * an explicit pinhole projection of a plane in space, so the camera-space
 * distance of every pixel on that plane is known in closed form. There is
 * nothing left for a model to infer.
 *
 * The result has exactly the two properties the brief says hand-painting gets
 * wrong: a continuous depth ramp across the screen plane, because the plane is
 * genuinely at an angle to the camera, and a hard step at the silhouette,
 * because the background is a different surface.
 *
 * --- What is in the base image ---------------------------------------------
 *
 * A real screenshot of a shipped project — Swift Eats, the same asset the
 * projects grid serves — composited into a device body. Not an empty wireframe
 * frame. Depth on a blank surface is invisible: it is the app UI inside the
 * screen that makes the parallax legible, because there is something with
 * structure to slide against the background.
 *
 * Nothing is fetched. The source is already in the repo.
 */

import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(root, 'public', 'projects', 'swift-eats', '1.webp');
const OUT_DIR = join(root, 'public', 'hero');

/**
 * Output dimensions. Both powers of two, per the brief — and 2:1, because the
 * hero band is wide and a square texture would waste half its pixels on sky.
 * The aspect is passed to the component as WIDTH/HEIGHT so the pointer offset is
 * not skewed; a hardcoded square there is the bug the brief calls out.
 */
const WIDTH = 1024;
const HEIGHT = 512;

/**
 * Rasterised at 2× and downsampled. Two reasons, and the second one matters
 * more than the first:
 *
 *   1. The silhouette and the screen's rounded corners are hard edges. Sampling
 *      them once per output pixel stair-steps them.
 *   2. Downsampling the DEPTH map averages across the silhouette step, which
 *      leaves it about one pixel soft. That is wanted, not tolerated: the trail
 *      attenuates against this edge, and a perfectly hard step there aliases
 *      badly — which is the same reason the shader attenuates instead of
 *      discarding.
 */
const SS = 2;
const RW = WIDTH * SS;
const RH = HEIGHT * SS;

// --- camera -----------------------------------------------------------------
// Pinhole at the origin looking down -Z. Focal length in supersampled pixels.
const FOCAL = 1750;
const CX = RW / 2;
const CY = RH / 2;

// --- the phone --------------------------------------------------------------
// Body size in world units, from the real screenshot's 1170×2532 aspect plus a
// bezel. Angles chosen so the plane is clearly oblique: a phone square-on to the
// camera has a constant depth across its screen, and then there is no ramp for
// the parallax to expose.
const SCREEN_ASPECT = 1170 / 2532;
// Sized so the tilted body clears both the top and bottom of a 2:1 frame with
// margin. At 1.62 the corners projected 14 px above and 1010 px below in a
// 1024-tall raster — the whole frame, with the composition cropped at both ends.
const BODY_H = 1.4;
const BODY_W = BODY_H * SCREEN_ASPECT + 0.055 * 2;
const BEZEL = 0.055;
const BODY_RADIUS = 0.115;
const SCREEN_RADIUS = 0.075;

const YAW = (-31 * Math.PI) / 180; // turned away from the light side
const PITCH = (7.5 * Math.PI) / 180; // top tipped back, so the ramp runs vertically too
// Lifted just clear of the bottom edge: the contact shadow needs frame under the
// phone to fall onto, and the corner-inside-frame assertion at the end of this
// script is what caught it sitting 2 px over.
const CENTER = [0.62, 0.02, -3.05];

/**
 * Two pairs of assets, one per reading direction — not one pair mirrored at
 * render time.
 *
 * A3's first RTL pass mirrored the canvas UV in the shader, the way A1 mirrors
 * its whole composition. On A1 that is right, because A1 draws signed distance
 * fields with no handedness. Here the texture contains a **photograph of a real
 * app**, and mirroring the canvas mirrors the UI inside the screen: the Arabic
 * hero shipped a phone running an app whose own text ran backwards. That is not
 * an RTL composition, it is a broken one, and it is exactly the "RTL was a port"
 * tell the poster's comment warns about.
 *
 * So the geometry is mirrored here instead, where the screenshot is composited:
 * the yaw and the position flip, the light crosses to the other side, and the
 * screen content is sampled unmirrored. The phone ends up on the reading-side
 * edge in both directions, angled correctly for where it sits, with legible UI.
 *
 * The cost is one extra pair of files in the repo and zero extra bytes for any
 * visitor — a page fetches the pair its own direction needs and never the other.
 */
const DIRECTIONS = [
  { suffix: '', mirror: 1 },
  { suffix: '-rtl', mirror: -1 },
];

// --- the light --------------------------------------------------------------
// One source, in the same place A1 and the poster put it: up and to the reading
// side. Violet at the core bleeding to electric blue, straight off the tokens.
const GLOW_1 = [0x8b, 0x5c, 0xf6]; // --glow-1
const GLOW_2 = [0x3b, 0x82, 0xf6]; // --glow-2
const INK = [0x0b, 0x0c, 0x10]; // --bg, dark
/*
 * Placed just inboard of and above the device, not out at 0.33 where it started.
 * Out there it read as an unattached purple smudge with a phone beside it; the
 * source has to be somewhere that plausibly lights the thing in frame, or the
 * "one light source" rule buys a mood instead of a composition. The screen's
 * `facing` falloff below is keyed to this: the phone's inboard edge is the lit
 * one.
 */
const LIGHT_UV = [0.52, 0.18];

/**
 * Rotation R = Rx(pitch) · Ry(yaw), applied to a local point. `mirror` is +1 for
 * a reading-left-to-right layout and −1 for right-to-left, and it negates the
 * yaw so the body turns the correct way for the side it ends up on.
 */
function rotate([x, y, z], mirror) {
  const yaw = YAW * mirror;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(PITCH);
  const sx = Math.sin(PITCH);
  // Ry
  const x1 = cy * x + sy * z;
  const y1 = y;
  const z1 = -sy * x + cy * z;
  // Rx
  return [x1, cx * y1 - sx * z1, sx * y1 + cx * z1];
}

/**
 * World position of the body's surface at (u, v), u across, v down, both 0..1.
 *
 * Affine in (u, v) because a plane is, which is the whole reason the inverse
 * below is a 2×2 solve rather than an iterative search.
 */
function surface(u, v, mirror) {
  const local = [(u - 0.5) * BODY_W, (0.5 - v) * BODY_H, 0];
  const r = rotate(local, mirror);
  return [r[0] + CENTER[0] * mirror, r[1] + CENTER[1], r[2] + CENTER[2]];
}

function project([x, y, z]) {
  const d = -z;
  return [CX + (FOCAL * x) / d, CY - (FOCAL * y) / d, d];
}

/**
 * Screen pixel → (u, v) on the body plane, plus the camera-space distance there.
 *
 * From sx = CX + f·X/d and sy = CY − f·Y/d with d = −Z, and X, Y, Z all affine in
 * (u, v), both equations become linear in (u, v). Two equations, two unknowns,
 * one 2×2 solve. Returns null when the plane is behind the camera or the system
 * is degenerate.
 */
function unproject(sx, sy, { P00, PU, PV }) {
  const px = sx - CX;
  const py = sy - CY;

  // px·(−Z) − f·X = 0  and  py·(−Z) + f·Y = 0
  const a11 = -px * PU[2] - FOCAL * PU[0];
  const a12 = -px * PV[2] - FOCAL * PV[0];
  const r1 = px * P00[2] + FOCAL * P00[0];

  const a21 = -py * PU[2] + FOCAL * PU[1];
  const a22 = -py * PV[2] + FOCAL * PV[1];
  const r2 = py * P00[2] - FOCAL * P00[1];

  const det = a11 * a22 - a12 * a21;
  if (Math.abs(det) < 1e-9) return null;

  const u = (r1 * a22 - r2 * a12) / det;
  const v = (a11 * r2 - a21 * r1) / det;
  const d = -(P00[2] + PU[2] * u + PV[2] * v);
  if (d <= 0.01) return null;
  return [u, v, d];
}

/** Signed distance to a rounded rectangle, negative inside. */
function sdRoundRect(px, py, hx, hy, r) {
  const qx = Math.abs(px) - hx + r;
  const qy = Math.abs(py) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const direction of DIRECTIONS) {
    await render(direction);
  }
}

async function render({ suffix, mirror }) {
  /*
   * The screenshot is 1170×2532 and lands about 260 px wide at 2× supersampling,
   * so it is being minified roughly 4.5×. Bilinear sampling at that ratio throws
   * away most of the source and aliases the app's type into noise, which would
   * defeat the point of using a real UI. sharp's resize does the filtering
   * properly first; the per-pixel sample below is then close to 1:1.
   */
  const screenH = 1400;
  const screenW = Math.round(screenH * SCREEN_ASPECT);
  const shot = await sharp(await readFile(SOURCE))
    .resize(screenW, screenH, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const sampleShot = (u, v) => {
    // Bilinear, clamped at the border.
    const fx = clamp01(u) * (screenW - 1);
    const fy = clamp01(v) * (screenH - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, screenW - 1);
    const y1 = Math.min(y0 + 1, screenH - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const p00 = shot[(y0 * screenW + x0) * 3 + c];
      const p10 = shot[(y0 * screenW + x1) * 3 + c];
      const p01 = shot[(y1 * screenW + x0) * 3 + c];
      const p11 = shot[(y1 * screenW + x1) * 3 + c];
      out[c] =
        p00 * (1 - tx) * (1 - ty) +
        p10 * tx * (1 - ty) +
        p01 * (1 - tx) * ty +
        p11 * tx * ty;
    }
    return out;
  };

  // The plane, as P(u,v) = A + B·u + C·v. Recomputed per direction because the
  // yaw and the position both flip.
  const P00 = surface(0, 0, mirror);
  const PU = surface(1, 0, mirror).map((c, i) => c - P00[i]);
  const PV = surface(0, 1, mirror).map((c, i) => c - P00[i]);
  const plane = { P00, PU, PV };

  // The light crosses with the phone, so it stays on the same side of the device
  // in both directions and the screen's `facing` falloff below stays correct.
  const lightU = mirror > 0 ? LIGHT_UV[0] : 1 - LIGHT_UV[0];

  // Depth range across the body, measured from its four corners rather than
  // assumed, so the normalisation below is tight whatever the angles become.
  let dNear = Infinity;
  let dFar = -Infinity;
  for (const [u, v] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const d = project(surface(u, v, mirror))[2];
    dNear = Math.min(dNear, d);
    dFar = Math.max(dFar, d);
  }

  /*
   * Depth budget. The body occupies the near half of the range and the
   * background the far fifth, leaving a gap between them: that gap is the
   * silhouette step, and it has to be wide enough that the trail's occlusion
   * test reads as "behind the phone" rather than as a rounding error.
   */
  const BODY_DEPTH_HI = 1.0;
  const BODY_DEPTH_LO = 0.52;
  const BG_DEPTH_HI = 0.2;
  const BG_DEPTH_LO = 0.03;

  const base = Buffer.alloc(RW * RH * 3);
  const depth = Buffer.alloc(RW * RH);

  // Precomputed screen-space position of the phone's centre, for the contact
  // shadow. Ellipse, not a blur of the silhouette — this is one soft occlusion,
  // not a second light.
  const bodyCentre = project(surface(0.5, 0.5, mirror));
  const bodyFoot = project(surface(0.5, 1, mirror));

  for (let y = 0; y < RH; y++) {
    for (let x = 0; x < RW; x++) {
      const i = y * RW + x;
      const sx = x + 0.5;
      const sy = y + 0.5;
      const nu = sx / RW;
      const nv = sy / RH;

      // --- background: charcoal under one radial light ---------------------
      const toLight = Math.hypot((nu - lightU) * (RW / RH), nv - LIGHT_UV[1]);
      const glow = Math.exp(-toLight * 1.9);
      const mixToBlue = clamp01(toLight * 0.95);
      const lightR = GLOW_1[0] * (1 - mixToBlue) + GLOW_2[0] * mixToBlue;
      const lightG = GLOW_1[1] * (1 - mixToBlue) + GLOW_2[1] * mixToBlue;
      const lightB = GLOW_1[2] * (1 - mixToBlue) + GLOW_2[2] * mixToBlue;

      let r = INK[0] + lightR * glow * 0.34;
      let g = INK[1] + lightG * glow * 0.34;
      let b = INK[2] + lightB * glow * 0.34;

      // Contact shadow: the phone is standing on something, and without this it
      // reads as pasted on rather than placed.
      const shadow = Math.exp(
        -(
          ((sx - bodyFoot[0]) / (RW * 0.1)) ** 2 +
          ((sy - bodyFoot[1] - RH * 0.012) / (RH * 0.028)) ** 2
        ),
      );
      const shade = 1 - 0.72 * shadow;
      r *= shade;
      g *= shade;
      b *= shade;

      /*
       * Background depth is a floor receding away from the viewer, not a flat
       * constant. A constant would make the trail's occlusion binary — either
       * wholly in front of the backdrop or wholly behind it — and the falloff
       * along the trail's length would have nothing to grade against.
       */
      let dv = BG_DEPTH_LO + (BG_DEPTH_HI - BG_DEPTH_LO) * smoothstep(0.15, 1.0, nv);

      // --- the body --------------------------------------------------------
      const hit = unproject(sx, sy, plane);
      if (hit) {
        const [u, v, dist] = hit;
        const bx = (u - 0.5) * BODY_W;
        const by = (v - 0.5) * BODY_H;
        const bodySdf = sdRoundRect(bx, by, BODY_W / 2, BODY_H / 2, BODY_RADIUS);

        if (bodySdf < 0) {
          const screenSdf = sdRoundRect(
            bx,
            by,
            BODY_W / 2 - BEZEL,
            BODY_H / 2 - BEZEL,
            SCREEN_RADIUS,
          );

          if (screenSdf < 0) {
            // Real app UI. The screen's own (u, v), remapped so the bezel is not
            // counted as part of the screenshot.
            const su = (bx + (BODY_W / 2 - BEZEL)) / (BODY_W - BEZEL * 2);
            const sv = (by + (BODY_H / 2 - BEZEL)) / (BODY_H - BEZEL * 2);
            const [pr, pg, pb] = sampleShot(su, sv);

            /*
             * The screen is lit by the same source as everything else, and it is
             * turned away from it — so it darkens across its width. Skipping
             * this is what makes a composited mockup read as a sticker: the UI
             * stays at full brightness while the body it sits in falls off.
             */
            /*
             * Keyed to which edge of the screen faces the light, which swaps with
             * the direction. Leaving this fixed would light the RTL phone from
             * the wrong side — the failure would be subtle rather than obviously
             * broken, which is worse.
             */
            const facing = mirror > 0 ? 0.72 + 0.28 * (1 - su) : 0.72 + 0.28 * su;
            r = pr * facing;
            g = pg * facing;
            b = pb * facing;
          } else {
            // Body: dark metal, with the light catching the near edge.
            const rim = Math.exp(-Math.abs(bodySdf) * 190);
            const edgeLight = 0.1 + 0.55 * rim;
            r = INK[0] * 1.6 + lightR * edgeLight * 0.55;
            g = INK[1] * 1.6 + lightG * edgeLight * 0.55;
            b = INK[2] * 1.6 + lightB * edgeLight * 0.55;
          }

          // The exact depth buffer: camera-space distance, normalised. This is
          // the value that gives the parallax real per-pixel structure and the
          // trail something true to be occluded by.
          const t = (dist - dNear) / (dFar - dNear);
          dv = BODY_DEPTH_HI - (BODY_DEPTH_HI - BODY_DEPTH_LO) * clamp01(t);
        }
      }

      base[i * 3] = Math.round(Math.min(255, Math.max(0, r)));
      base[i * 3 + 1] = Math.round(Math.min(255, Math.max(0, g)));
      base[i * 3 + 2] = Math.round(Math.min(255, Math.max(0, b)));
      depth[i] = Math.round(clamp01(dv) * 255);
    }
  }

  const basePath = join(OUT_DIR, `a3-base${suffix}.webp`);
  const depthPath = join(OUT_DIR, `a3-depth${suffix}.webp`);

  await sharp(base, { raw: { width: RW, height: RH, channels: 3 } })
    .resize(WIDTH, HEIGHT, { kernel: 'lanczos3' })
    .webp({ quality: 82, effort: 6 })
    .toFile(basePath);

  /*
   * The depth map is written LOSSLESS, and that is not over-caution. Lossy WebP
   * is tuned to hide error where the eye does not look, which on a smooth ramp
   * means banding — and this ramp is not being looked at, it is being used as a
   * coordinate. A 2-value step becomes a visible terrace in the parallax and a
   * shelf in the trail's occlusion. It compresses well anyway: a grayscale ramp
   * is close to the best case for the format.
   */
  await sharp(depth, { raw: { width: RW, height: RH, channels: 1 } })
    .resize(WIDTH, HEIGHT, { kernel: 'lanczos3' })
    .webp({ lossless: true, effort: 6 })
    .toFile(depthPath);

  const sizes = await Promise.all(
    [basePath, depthPath].map(async (p) =>
      ((await readFile(p)).length / 1024).toFixed(1),
    ),
  );

  const label = suffix === '' ? 'ltr' : 'rtl';
  console.log(
    `✓ a3-base${suffix}.webp`.padEnd(26) + `${WIDTH}×${HEIGHT}  ${sizes[0]} KB`,
  );
  console.log(
    `✓ a3-depth${suffix}.webp`.padEnd(26) +
      `${WIDTH}×${HEIGHT}  ${sizes[1]} KB  (lossless)`,
  );
  console.log(
    `  ${label}: body centre ${bodyCentre[0].toFixed(0)},${bodyCentre[1].toFixed(0)} ` +
      `of ${RW}×${RH}   depth ${dNear.toFixed(3)}..${dFar.toFixed(3)}`,
  );

  // A depth map whose body never reaches near-white, or whose background never
  // reaches near-black, has lost the silhouette step the trail's occlusion
  // depends on. Assert it rather than eyeball it.
  const resized = await sharp(depthPath).raw().toBuffer();
  let lo = 255;
  let hi = 0;
  for (const value of resized) {
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  console.log(`  ${label}: depth map range ${lo}..${hi} (of 0..255)`);
  if (hi < 240 || lo > 20) {
    throw new Error(
      `Depth map does not span its range (${lo}..${hi}). The silhouette step ` +
        `the pointer trail occludes against would be too shallow to read.`,
    );
  }

  // And the writer's own sanity check: the four body corners must all land
  // inside the frame, or the composition is cropped and the aspect passed to the
  // shader will not match what is visible.
  for (const [u, v] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const [px, py] = project(surface(u, v, mirror));
    if (px < 0 || px > RW || py < 0 || py > RH) {
      throw new Error(
        `${label}: body corner (${u},${v}) projects to ${px.toFixed(0)},${py.toFixed(0)} — outside ${RW}×${RH}.`,
      );
    }
  }
}

await main();

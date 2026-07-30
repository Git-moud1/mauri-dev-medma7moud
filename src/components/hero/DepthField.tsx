'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClampToEdgeWrapping,
  LinearFilter,
  MeshBasicNodeMaterial,
  NoColorSpace,
  RenderPipeline,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector4,
  WebGPURenderer,
  type Texture,
} from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  abs,
  blendScreen,
  clamp,
  dot,
  float,
  fract,
  int,
  length,
  max,
  mix,
  mx_cell_noise_float,
  oneMinus,
  pass,
  saturate,
  select,
  smoothstep,
  step,
  texture,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

import { MAX_DPR } from './capability';
import type { HeroLayerProps } from './HeroCanvas';
import { HeroWords } from './HeroWords';
import type { Direction } from './LatticePoster';
import { observeTheme, readRgbToken, type Rgb01 } from './tokens';

/**
 * CONCEPT A3 — a depth-map hero. `three/webgpu` node materials, written in TSL.
 *
 * Not geometry. One flat plane carrying two textures — a photographic base image
 * and its grayscale depth map — and a fragment graph that offsets the base
 * image's UVs by the depth value scaled by pointer position. The image
 * parallaxes with real per-pixel depth.
 *
 * That is the whole claim: **A2's depth conviction from a single quad.** The
 * depth is genuine, so it holds at the extremes of the motion where A1's 2D
 * shear falls apart, and there is no extruded geometry to pay for. On top of it a
 * scan line travels through *depth space* rather than screen space, revealing a
 * cell-noise dot grid, and a pointer trail is occluded by the same depth map.
 *
 * --- One TSL graph, two backends ------------------------------------------
 *
 * `WebGPURenderer` falls back to its own WebGL2 backend where WebGPU is absent,
 * and TSL compiles to WGSL or GLSL from the same node graph. There is
 * deliberately no second hand-written GLSL path here: that would be two shaders
 * to keep in agreement, and the one that only runs on the minority backend is
 * the one that silently rots.
 *
 * --- Corrections to the reference this was built from ----------------------
 *
 * Six. Four are named in the brief; the fifth and sixth were found against the
 * installed three — the sixth only at runtime, because it compiles fine and
 * throws on the first draw:
 *
 *   1. The scan line was frozen. `float(uScanProgress.value)` reads `.value`
 *      while the graph is being *constructed*, when it is still 0, and bakes
 *      that constant into the compiled shader. The uniform node itself has to be
 *      passed. See `uScan` below.
 *   2. Nothing was disposed. Three locale routes and a query-param switch mean
 *      navigation would stack render pipelines and GPU textures for the life of
 *      the tab.
 *   3. Two `useFrame` callbacks for two uniform writes. One subscription now,
 *      and because the render call is the last statement in it, the
 *      "priority-1 callback must run last" ordering is satisfied by
 *      construction rather than by getting two priorities right.
 *   4. `titleWords` was rebuilt every render with only `.length` in the
 *      dependency array — a new array identity feeding an effect that could not
 *      see it had changed. It is derived per locale outside the component now,
 *      in `HeroWords`.
 *   5. `PostProcessing` and `renderAsync()` are both deprecated in three 0.185
 *      (r183 and r181 respectively) and each emits a console warning on use.
 *      This uses `RenderPipeline` and `render()`, with `renderer.init()` awaited
 *      in the async `gl` factory where it belongs.
 *   6. The whole fragment graph has to be built inside a TSL `Fn`. `toVar()`,
 *      `If()` and `Loop()` emit statements, and a statement needs a stack, which
 *      only exists while a shader function is being built. The reference's
 *      material is expression-only so it gets away with module scope; adding a
 *      loop to it throws `Cannot read properties of null (reading 'If')`.
 */

/**
 * Where the assets live. Self-hosted; nothing is fetched from a third party.
 *
 * Two pairs, one per reading direction, and a page fetches only its own — so RTL
 * costs a visitor nothing extra. The first version mirrored a single pair in
 * shader space the way A1 mirrors its composition, which on a texture containing
 * a *photograph of a real app* mirrored the UI inside the phone screen: `/ar`
 * shipped a device running an app whose own text ran backwards. `gen-hero-depth.mjs`
 * mirrors the geometry at composite time instead.
 */
const ASSETS = {
  ltr: { base: '/hero/a3-base.webp', depth: '/hero/a3-depth.webp' },
  rtl: { base: '/hero/a3-base-rtl.webp', depth: '/hero/a3-depth-rtl.webp' },
} as const;

/**
 * `?trail=0` switches the pointer trail off, and exists so its cost can be
 * measured as an increment against A3 with everything else held identical.
 *
 * It works by pinning the trail's bounding radius to zero, which makes the
 * shader's early-out false at every fragment and the capsule loop never execute.
 * That is deliberately the *only* thing it changes: the graph is the same graph,
 * the compiled shader is the same shader and the chunk is the same bytes, so the
 * difference between the two runs is the loop and nothing else. A second code
 * path would have measured the second code path.
 */
function trailEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return new URLSearchParams(window.location.search).get('trail') !== '0';
}

/**
 * The real dimensions of the asset, not the reference's hardcoded 300×300.
 *
 * A phone mockup is not square, and this number scales the pointer offset: with
 * a wrong aspect the parallax moves further horizontally than vertically for the
 * same pointer travel, which reads as a skew rather than as depth.
 */
const WIDTH = 1024;
const HEIGHT = 512;
const TEX_ASPECT = WIDTH / HEIGHT;

/**
 * Where the subject sits in each texture, horizontally, in UV — the phone's
 * centre, mirrored between the two assets — and where that point lands in the
 * hero box.
 *
 * The anchor is past the middle on the reading-end edge, which is where
 * `LatticePoster` and A1 both put the phone, so the three concepts read as the
 * same composition rather than as three layouts that happen to share a palette.
 */
const PLACEMENT = {
  ltr: { focusU: 0.68, anchorX: 0.79 },
  rtl: { focusU: 0.32, anchorX: 0.21 },
} as const;

/**
 * How much of the hero's height the composition occupies, anchored to the
 * bottom. A fixed fraction, not a width fit.
 *
 * A width fit gives `canvasAspect / 2`, which swings from 0.76 on a 1280-wide
 * desktop hero to 0.23 at 390×844 — a phone that fills the box on one viewport
 * and is a thumbnail on the other, and the second of those is the viewport
 * everything here is measured at. Fixing the fraction instead makes the
 * composition's relationship to the headline the same everywhere, and the aspect
 * is absorbed on the width axis where there is backdrop to spare.
 *
 * The value is set by the `<h1>`, not by taste: the headline's band ends around
 * 0.58 of the way up the hero box, and the image is not allowed above it.
 */
const HEIGHT_FRAC = 0.58;

/**
 * The hero's cycle, shared with A1 and A2 so the three concepts are compared at
 * matching moments rather than at whatever phase each happens to be in.
 * `0.5 - 0.5·cos(t · 0.24)` has a period of 2π/0.24 ≈ 26 s.
 */
const CYCLE_RATE = 0.24;
const CYCLE_SECONDS = (Math.PI * 2) / CYCLE_RATE;

// --- parallax ---------------------------------------------------------------

/** Pointer travel of ±1 shifts the near plane by this much, in texture UV. */
const PARALLAX = 0.03;

/**
 * The depth that does not move. Below it the backdrop drifts slightly *against*
 * the pointer, above it the phone moves with it — which is what separates the
 * two planes. Set at the backdrop's own depth band (see gen-hero-depth.mjs) so
 * the floor stays nearly still and the subject carries the motion.
 */
const DEPTH_PIVOT = 0.24;

// --- the scan line and the dot grid ----------------------------------------

/**
 * The subject's depth band, matching what `gen-hero-depth.mjs` writes: the phone
 * occupies 0.52..1.0 and the backdrop 0.03..0.20. The scan sweeps this range
 * only, and the dot mask is gated to it.
 */
const SUBJECT_DEPTH_LOW = 0.52;
const SUBJECT_DEPTH_HIGH = 1.0;

/** Half-width of the scan band, in depth units. */
const SCAN_WIDTH = 0.045;

/**
 * Sweeps of the subject's depth range per second. One pass every ~11 s, which is
 * a little over two per 26 s cycle — deliberately not a whole-number ratio, so
 * the scan and the breath do not lock into a visible pattern.
 */
const SCAN_RATE = 0.09;
/** Dot cells across the texture's height; the width is scaled by TEX_ASPECT. */
const GRID = 46;
/** Dot radius as a fraction of a cell. */
const DOT_RADIUS = 0.3;
/** Fraction of cells that are lit at all, chosen per cell by the cell noise. */
const DOT_DENSITY = 0.62;

// --- the pointer trail ------------------------------------------------------

/**
 * Ring buffer length, and the rate it is written at.
 *
 * The buffer is written *in place* — one element per sample, the head index
 * advancing — and never rebuilt. Rebuilding it per frame is the mistake the
 * brief says to watch for, and it would show up as bytes and GC pressure rather
 * than as frame time, which is the hard kind to notice.
 *
 * 16 samples at 30 Hz is 0.53 s of history. The rate is decoupled from the frame
 * rate on purpose: at 60 Hz a per-frame write would need 32 samples for the same
 * span, and each extra sample is another capsule evaluated at every fragment.
 */
const TRAIL = 16;
const TRAIL_HZ = 30;

/**
 * Trail lifetime, tuned against the 26 s cycle rather than in isolation.
 *
 * One sixtieth of the cycle. The point of the ratio is that the trail has to
 * read as a *transient* against the hero's slow breathing — long enough to be a
 * stroke rather than a dot, short enough that it is never mistaken for a second,
 * competing motion. Set it to a second or two and the page acquires two slow
 * rhythms that beat against each other.
 */
const TRAIL_LIFE = CYCLE_SECONDS / 60;

/**
 * Head and tail radii, in aspect-corrected screen units — so 0.03 is 3% of the
 * canvas *height*, about 25 px on the 390×844 test viewport. The first pass used
 * 0.055 and produced a soft blob rather than a stroke: at that radius successive
 * samples overlap almost completely and the falloff along the length has nothing
 * to grade across.
 */
const TRAIL_HEAD_R = 0.028;
const TRAIL_TAIL_R = 0.006;

/**
 * How much of the trail survives where the depth map says it is behind. Not
 * zero: a hard discard puts a stair-stepped silhouette through the middle of the
 * glow, and the phone's edge is exactly where the eye is looking. Attenuating
 * keeps the occlusion legible and the edge clean.
 */
const TRAIL_OCCLUDED = 0.1;
/** Softness of the occlusion crossover, in depth units. */
const OCCLUSION_SOFT = 0.05;

// --- exposure ---------------------------------------------------------------

/**
 * The over-unity multiplier on the emitter colour.
 *
 * The reference multiplies its mask by `vec3(10, 0, 0)` — a *direction* in colour
 * space scaled well past 1.0, not a colour. Swapping in the brand blue is
 * therefore not a matter of substituting the token: the same scalar gain on a
 * different direction lands at a different luminance, and the bloom threshold is
 * a luminance test.
 *
 * Pure red at gain 10 has Rec.709 luminance 10 × 0.2126 = 2.13. The brand blue
 * `--glow-2` (#3B82F6) normalised so its peak channel is 1.0 is
 * (0.240, 0.528, 1.000), whose luminance per unit of gain is
 * 0.2126·0.240 + 0.7152·0.528 + 0.0722·1.000 = 0.501 — because the token carries
 * a lot of green. Matching the reference's luminance therefore needs a gain of
 * 2.13 / 0.501 ≈ 4.2, not 10. At 10 the mask would sit at 5 nits-equivalent of
 * headroom above the bloom threshold and smear.
 */
const MASK_GAIN = 4.2;

/**
 * The trail's gain, set last — after the scan line was already tuned — because
 * both emitters pass through the same bloom and therefore share one exposure
 * budget. Below the mask's, since the trail covers a smaller area at higher
 * local density.
 */
const TRAIL_GAIN = 3.4;

/**
 * Bloom. `threshold` is the interesting one: it sits *at* the photograph's white
 * point, so the only thing in frame that blooms is the over-unity emitters. Drop
 * it below 1.0 and the app UI inside the phone screen — which is mostly white
 * cards — starts smearing, and the whole reason for using a real screenshot is
 * lost to a haze.
 */
const BLOOM_STRENGTH = 0.62;
const BLOOM_RADIUS = 0.55;
const BLOOM_THRESHOLD = 1.0;

/**
 * How far above the headline the composition is allowed to reach. The `<h1>` owns
 * the top of the hero on every concept; this is A1's `headroom` term by another
 * name, and it applies to the emitters as well as the image so a scan line
 * cannot pass behind the text at full strength.
 */
const HEADROOM_LOW = 0.5;
const HEADROOM_HIGH = 0.74;

/** `--glow-2`, the electric blue end of the site's one light source. */
const GLOW_2_FALLBACK: Rgb01 = [59 / 255, 130 / 255, 246 / 255];

/**
 * The emitter's direction in colour space: the token, renormalised so its peak
 * channel is exactly 1.0.
 *
 * Renormalising rather than using the token's own magnitude is what makes
 * MASK_GAIN mean the same thing whatever the token is edited to. Without it, a
 * future palette tweak that darkens `--glow-2` would quietly dim the scan line
 * and change how it blooms.
 */
function blueDirection(token: Rgb01): [number, number, number] {
  const peak = Math.max(token[0], token[1], token[2], 1e-4);
  return [token[0] / peak, token[1] / peak, token[2] / peak];
}

/**
 * sRGB transfer, applied because the emitter is added in the *linear* space the
 * half-float scene pass works in, while the token is an sRGB triple. Skipping
 * this makes the blue read closer to cyan and shifts its luminance by about 2×,
 * which then invalidates the gain derived above.
 */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/* -------------------------------------------------------------------------- */

/** One texture, configured the way both roles need. */
function configure(map: Texture, isData: boolean): Texture {
  /*
   * Linear on both axes, and NearestFilter explicitly off for the depth map: it
   * is a coordinate, not a lookup table, and a nearest sample turns a smooth
   * ramp into visible terraces in the parallax.
   */
  map.magFilter = LinearFilter;
  map.minFilter = LinearFilter;
  /*
   * No mipmaps. The texture is 1024×512 against a canvas that is between roughly
   * 390 and 1440 wide, so it is sampled near 1:1 or magnified — mips would cost
   * generation time on mount, which is the resource this whole plan is
   * protecting, and buy nothing.
   */
  map.generateMipmaps = false;
  /*
   * Clamp, not repeat. The parallax offset and the cover window both push the
   * sample outside 0..1 at the edges; wrapping there would slide the opposite
   * side of the composition into frame. The asset's border is flat charcoal, so
   * clamping extends invisibly.
   */
  map.wrapS = ClampToEdgeWrapping;
  map.wrapT = ClampToEdgeWrapping;
  // The depth map is data. Decoding it as sRGB would bend the ramp.
  map.colorSpace = isData ? NoColorSpace : SRGBColorSpace;
  return map;
}

interface Assets {
  base: Texture;
  depth: Texture;
}

/**
 * The scene: one plane, one node material, one render pipeline.
 *
 * Everything visual happens in the fragment graph, so the "scene" is a quad and
 * a camera. That is the point of the concept — there is no geometry to build,
 * light, sort or dispose.
 */
function DepthPlane({
  assets,
  dir,
  onFirstFrame,
}: {
  assets: Assets;
  dir: Direction;
  onFirstFrame: () => void;
}) {
  const placement = PLACEMENT[dir];

  /*
   * r3f 9 types `state.gl` as `WebGLRenderer` because that is what it constructs
   * by default. The `gl` factory below returns a `WebGPURenderer` — r3f accepts
   * any object with a `render` method — so this is the one place the narrower
   * declared type has to be corrected, and it is corrected once rather than at
   * every use.
   */
  const renderer = useThree((state) => state.gl) as unknown as WebGPURenderer;
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const viewport = useThree((state) => state.viewport);

  /**
   * The pointer, in canvas UV, smoothed. Read from `window` rather than from
   * r3f's own pointer because the hero layer is `pointer-events-none` by design —
   * the canvas never receives an event, and it must not start, or the CTAs
   * underneath it stop being clickable.
   */
  const pointer = useRef({ x: 0.5, y: 0.5, seen: false });

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pointer.current.x = (event.clientX - rect.left) / rect.width;
      // Canvas UV has y up; client coordinates have y down.
      pointer.current.y = 1 - (event.clientY - rect.top) / rect.height;
      pointer.current.seen = true;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
    };
  }, [renderer]);

  /*
   * The graph, the material and the pipeline, built once per (renderer, assets)
   * pair and disposed together below.
   *
   * Uniform nodes are created here and mutated in the frame callback. That is
   * the whole reason they are uniforms: rebuilding any part of this graph per
   * frame would recompile a shader per frame.
   */
  const gpu = useMemo(() => {
    const uTime = uniform(0);
    const uCycle = uniform(0);
    const uScan = uniform(0);
    const uAspect = uniform(1);
    /*
     * Placement as uniforms rather than as constants baked into the graph, so a
     * language change writes two floats instead of recompiling a shader. It also
     * keeps the whole direction question in one place: there is no mirroring
     * anywhere in this graph, only two numbers that differ per direction and two
     * textures that were composited to match them.
     */
    const uFocusU = uniform(placement.focusU);
    const uAnchorX = uniform(placement.anchorX);
    const uPointer = uniform(new Vector2(0.5, 0.5));
    const uEmitter = uniform(vec3(0, 0, 0));
    /** Bounding circle of the live trail, so most fragments skip the loop. */
    const uTrailBounds = uniform(new Vector4(0.5, 0.5, 0, 0));

    /**
     * The ring buffer: `(x, y, depth, stamp)` per sample, in aspect-corrected
     * canvas space. `uniformArray` keeps the JS-side objects and re-packs them
     * on render, so writing one element is a single `Vector4.set` — no
     * allocation, no array rebuild.
     */
    const trailData = Array.from({ length: TRAIL }, () => new Vector4(0, 0, 0, -1));
    const uTrail = uniformArray<'vec4'>(trailData, 'vec4');

    /*
     * The whole fragment graph lives inside an `Fn`, and it has to.
     *
     * `toVar()`, `If()` and `Loop()` all emit statements, and a statement needs
     * somewhere to be emitted — TSL calls that the *stack*, and a stack only
     * exists while a shader function is being built. Constructing this graph at
     * module scope, the way the reference does for its simpler expression-only
     * material, throws `Cannot read properties of null (reading 'If')` the moment
     * a loop is added. The uniforms above stay outside, because their handles
     * have to survive the call to be written every frame.
     */
    const colorNode = Fn(() => {
      // --- shared geometry of the frame -------------------------------------
      const canvasUv = uv().toVar();

      /*
       * Placement: a fixed fraction of the box's height, anchored to the bottom
       * and to the reading-end edge. NOT cover.
       *
       * Cover was the first attempt and it was wrong for this box. The hero is a
       * wide, short band; cover-fitting a 2:1 texture into it zooms the subject
       * up until the phone sits dead centre at full height — directly behind the
       * `<h1>`, which is the one thing every concept here is forbidden to
       * disturb. `HEIGHT_FRAC` puts the image entirely below the headline's band
       * instead, at every viewport, and lets the width axis absorb the aspect
       * where there is backdrop to spare.
       *
       * The letterbox above the image costs nothing because `ClampToEdge` extends
       * the texture's own top row, and that row is flat charcoal — so the seam is
       * invisible rather than hidden. It is faded out by `headroom` below in any
       * case.
       */
      const vFrac = float(HEIGHT_FRAC);
      const uFrac = vFrac.mul(TEX_ASPECT).div(uAspect).toVar();

      // The texture's FOCUS point lands at ANCHOR in canvas space; the bottom of
      // the texture lands at the bottom of the box.
      const originX = uAnchorX.sub(uFrac.mul(uFocusU));
      const baseUv = vec2(
        canvasUv.x.sub(originX).div(uFrac),
        canvasUv.y.div(vFrac),
      ).toVar();

      // Depth is sampled at the *undisplaced* UV. Sampling it at the offset UV
      // would make the offset depend on itself.
      const depthAt = texture(assets.depth, baseUv).r.toVar();

      // --- the parallax ------------------------------------------------------
      /*
       * The offset is scaled by `vec2(1/TEX_ASPECT, 1)` so a given pointer travel
       * moves the same number of *texture pixels* on both axes. Without it the
       * motion is twice as fast horizontally on a 2:1 asset, which is the skew the
       * brief's note about the hardcoded 300×300 is about.
       */
      const pointerTex = vec2(uPointer.x.sub(0.5).mul(2), uPointer.y.sub(0.5).mul(2));
      const offset = pointerTex
        .mul(PARALLAX)
        .mul(vec2(1 / TEX_ASPECT, 1))
        .mul(depthAt.sub(DEPTH_PIVOT));

      const imageUv = baseUv.add(offset);
      const baseColor = texture(assets.base, imageUv).rgb.toVar();

      // --- the scan line, travelling through depth space ---------------------
      /*
       * FIX 1. `uScan` is the uniform *node*. The reference's
       * `float(uScanProgress.value)` snapshots the JavaScript number during graph
       * construction — which is 0 — and compiles it in as a literal, so the band
       * sits forever at the far plane and only the in-material flow appears to
       * move.
       */
      const scanPos = uScan;
      const band = oneMinus(
        smoothstep(float(0), float(SCAN_WIDTH), abs(depthAt.sub(scanPos))),
      ).toVar();

      /*
       * The band is confined to the subject's depth range, and this is a
       * correction rather than a decoration.
       *
       * The backdrop is a shallow, nearly flat ramp — by construction, it is a
       * floor receding — so a scan that sweeps the whole 0..1 range crosses the
       * entire backdrop's depth within a few percent of its travel and lights the
       * whole lower half of the frame at once. What should read as a line reads as
       * a wall of dots. Restricting the sweep to the phone's own band means the
       * only thing the scan ever reveals is the structure that actually has depth
       * to reveal, which is also the only place a viewer can *see* that the sweep
       * is happening in depth rather than down the screen.
       */
      const onSubject = smoothstep(
        float(SUBJECT_DEPTH_LOW - 0.06),
        float(SUBJECT_DEPTH_LOW + 0.02),
        depthAt,
      );

      // --- the dot grid the scan reveals -------------------------------------
      // Cells are square in texture pixels, hence the aspect on the x axis.
      const cellUv = imageUv.mul(vec2(GRID * TEX_ASPECT, GRID));
      const cellId = mx_cell_noise_float(vec3(cellUv, 0));
      const inCell = fract(cellUv).sub(0.5);
      const dotShape = oneMinus(
        smoothstep(float(DOT_RADIUS * 0.55), float(DOT_RADIUS), length(inCell)),
      );
      const dots = dotShape.mul(step(cellId, float(DOT_DENSITY)));
      const maskIntensity = dots.mul(band).mul(onSubject).mul(MASK_GAIN).toVar();

      // --- the pointer trail -------------------------------------------------
      /*
       * A capsule SDF chain evaluated against the ring buffer, in screen space —
       * not tube geometry along a spline. It composites with the depth test for
       * free and costs no geometry at all, which is the only reason a trail is
       * affordable on top of everything else here.
       */
      const aspectScale = vec2(uAspect, 1);
      const fragP = canvasUv.mul(aspectScale).toVar();
      const trailGlow = float(0).toVar();

      /*
       * The whole loop is skipped outside the trail's bounding circle, which is
       * computed on the JS side from the same 16 elements the uniform upload
       * already walks. The trail is spatially tiny, so on real hardware entire
       * warps take the false branch and the 16 capsule evaluations never run for
       * the overwhelming majority of fragments.
       */
      If(length(fragP.sub(uTrailBounds.xy)).lessThan(uTrailBounds.z), () => {
        Loop(TRAIL, ({ i }) => {
          // Temporally adjacent pairs, wrapping at the end of the buffer. No
          // modulo: one comparison is cheaper and reads clearer.
          const next = i.add(1);
          const j = select(next.equal(int(TRAIL)), int(0), next);

          const a = uTrail.element(i).toVar();
          const b = uTrail.element(j).toVar();

          const pa = fragP.sub(a.xy);
          const ba = b.xy.sub(a.xy);
          const h = clamp(dot(pa, ba).div(max(dot(ba, ba), float(1e-6))), 0, 1).toVar();
          const distance = length(pa.sub(ba.mul(h)));

          const segDepth = mix(a.z, b.z, h);
          const age = uTime.sub(mix(a.w, b.w, h)).toVar();

          /*
           * Three gates, and the third is the one that matters: `a.w <= b.w`
           * rejects exactly one pair per frame — the seam where the head index has
           * just overwritten the oldest sample, so the two neighbours are not
           * adjacent in time. Without it the trail grows a chord across the screen
           * from its head back to its tail.
           */
          const alive = step(float(0), a.w)
            .mul(step(float(0), b.w))
            .mul(step(a.w, b.w))
            .mul(oneMinus(step(float(TRAIL_LIFE), age)));

          // Head bright, tail decaying — the falloff along the length is what
          // carries the motion.
          const fade = saturate(age.div(TRAIL_LIFE)).toVar();
          const decay = oneMinus(fade).mul(oneMinus(fade));
          const radius = mix(float(TRAIL_HEAD_R), float(TRAIL_TAIL_R), fade);
          const core = oneMinus(smoothstep(radius.mul(0.25), radius, distance));

          /*
           * Occlusion: the trail carries its own depth, the depth map is sampled at
           * the same fragment, and the trail is attenuated — not discarded — where
           * it is the deeper of the two. This is the feature A2 was buying with
           * extruded geometry and A1 could not do at all; here the information is
           * already in the texture.
           */
          const inFront = smoothstep(
            float(-OCCLUSION_SOFT),
            float(OCCLUSION_SOFT),
            segDepth.sub(depthAt),
          );
          const visibility = mix(float(TRAIL_OCCLUDED), float(1), inFront);

          /*
           * Union by `max`, never by sum. Summing overlapping capsules stacks
           * over-unity emitters on top of each other, and two over-unity emitters
           * through one bloom pass is precisely the white smear the brief names as
           * the failure mode to watch for. `max` makes it structurally impossible
           * rather than something to tune away.
           */
          trailGlow.assign(max(trailGlow, core.mul(decay).mul(alive).mul(visibility)));
        });
      });

      const trailIntensity = trailGlow.mul(TRAIL_GAIN);

      /*
       * The two emitters are combined with `max` for the same reason the capsules
       * are: they share one exposure budget because they share one bloom pass, and
       * adding them lets the trail crossing a lit scan band exceed both.
       */
      const emitter = uEmitter.mul(max(maskIntensity, trailIntensity));

      /*
       * `blendScreen` rather than an add, and this is what makes an over-unity
       * multiplier safe: screen saturates at 1.0 wherever the base is already 1.0,
       * so the phone's white app UI is *protected* from the mask while the charcoal
       * backdrop takes it at nearly full strength.
       */
      const lit = blendScreen(baseColor, emitter).toVar();

      /*
       * The composition falls away before the headline's band, applied after the
       * emitters so a scan line cannot pass behind the `<h1>` at full strength.
       * Same intent as A1's `headroom`, in canvas UV rather than in its normalised
       * space.
       */
      const headroom = smoothstep(float(HEADROOM_HIGH), float(HEADROOM_LOW), canvasUv.y);
      // A slow breath on the shared cycle, so the plane is never completely inert
      // between scan passes.
      const breath = float(0.9).add(uCycle.mul(0.14));

      return vec4(lit.mul(headroom).mul(breath), 1);
    })();

    const material = new MeshBasicNodeMaterial();
    material.colorNode = colorNode;
    material.transparent = false;
    material.depthWrite = false;
    material.depthTest = false;

    /*
     * One pass, then bloom over it, then the sum. Both emitters are inside the
     * scene pass, so both reach the bloom — one exposure budget, as intended.
     * The pass render target is half-float by default, which is what lets the
     * over-unity emitter survive to be thresholded at all.
     */
    const scenePass = pass(scene, camera);
    const scenePassColor = scenePass.getTextureNode();
    const bloomPass = bloom(
      scenePassColor,
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );

    const pipeline = new RenderPipeline(renderer);
    pipeline.outputNode = scenePassColor.add(bloomPass);

    return {
      material,
      pipeline,
      uTime,
      uCycle,
      uScan,
      uAspect,
      uFocusU,
      uAnchorX,
      uPointer,
      uEmitter,
      uTrail,
      uTrailBounds,
      trailData,
    };
    // `placement` is written through its two uniforms in the frame callback
    // rather than rebuilt into the graph, so a language change writes two floats
    // instead of recompiling a shader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, scene, camera, assets]);

  /**
   * FIX 2. Teardown.
   *
   * The reference builds its post-processing in `useMemo` and never disposes it.
   * With three locale routes and a query-param concept switch, navigating stacks
   * render pipelines, GPU textures and compiled node materials for the life of
   * the tab — and each one holds a render target at canvas resolution.
   *
   * Deps match the `useMemo` above exactly, so the cleanup always runs against
   * the objects it created.
   */
  useEffect(
    () => () => {
      gpu.pipeline.dispose();
      gpu.material.dispose();
      assets.base.dispose();
      assets.depth.dispose();
    },
    [gpu, assets],
  );

  /**
   * The one token this concept reads, tracked into a ref rather than written
   * straight to the uniform.
   *
   * Everything the theme observer produces is copied into the uniform by the
   * frame callback below instead, which is what keeps *all* GPU-side mutation in
   * exactly one place. That is worth a level of indirection: `react-hooks`'
   * immutability rule cannot tell a three.js uniform — an object whose entire
   * purpose is to be written every frame, and which is deliberately kept out of
   * React state so that writing it does not schedule a render — from a value
   * React owns, so every site that mutates one needs a justification. One site
   * needs one.
   */
  const emitter = useRef<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    const read = () => {
      const styles = getComputedStyle(document.documentElement);
      const token = readRgbToken(styles, '--glow-2', GLOW_2_FALLBACK);
      const [r, g, b] = blueDirection(token);
      // Linearised here, once per theme change, rather than per frame.
      emitter.current = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
    };
    read();
    return observeTheme(read);
  }, []);

  const clock = useRef({ elapsed: 0, nextSample: 0, head: 0, shown: false });
  // Read once. The measurement switch cannot change mid-page-view, and reading it
  // per frame would put a URL parse in the render loop.
  const [trail] = useState(trailEnabled);

  /**
   * FIX 3. One frame callback.
   *
   * Priority 1, which takes r3f's automatic render away and hands it here — so
   * the pipeline's `render()` has to be the last statement, after every uniform
   * for this frame has been written. Two subscriptions for two uniform writes
   * cost a second traversal of r3f's callback list every frame to get the
   * ordering that falls out of a single callback for free.
   *
   * It is also the *only* place any uniform is written. `mirror`, the canvas
   * aspect and the palette token could each have had their own effect, but
   * folding them in here means one exception to the immutability rule instead of
   * four, and each of them is a scalar assignment — cheaper than the effect that
   * would otherwise schedule it.
   */
  /* eslint-disable react-hooks/immutability -- `gpu` holds three.js uniform
     nodes: GPU objects whose entire contract is to be mutated once per frame.
     They are outside React state deliberately, because routing them through
     `setState` would schedule a render per frame for values that no React output
     reads. The rule cannot distinguish that from mutating application state, and
     this is the only place in the file it has to be told so. */
  useFrame((state, delta) => {
    const c = clock.current;
    // Clamped, so a tab that was backgrounded does not resume with a jump.
    c.elapsed += Math.min(delta, 1 / 15);

    gpu.uTime.value = c.elapsed;
    // The shared 0..1-and-back fold, at A1's and A2's rate.
    gpu.uCycle.value = 0.5 - 0.5 * Math.cos(c.elapsed * CYCLE_RATE);

    // Read from the live state rather than from a resize effect, so a rotation
    // or a devtools drag cannot leave the cover window fitted to the old box.
    gpu.uAspect.value = state.size.width / Math.max(1, state.size.height);
    gpu.uFocusU.value = placement.focusU;
    gpu.uAnchorX.value = placement.anchorX;

    gpu.uEmitter.value.set(emitter.current[0], emitter.current[1], emitter.current[2]);

    /*
     * The scan sweeps depth, not the screen: it starts behind the backdrop and
     * ends past the near face of the phone, so it crosses the silhouette rather
     * than sliding over it. A screen-space sweep would look identical on a flat
     * image, which is exactly the thing this concept is trying to prove it is not
     * doing.
     */
    const sweep = (c.elapsed * SCAN_RATE) % 1;
    gpu.uScan.value =
      SUBJECT_DEPTH_LOW -
      SCAN_WIDTH * 2 +
      sweep * (SUBJECT_DEPTH_HIGH - SUBJECT_DEPTH_LOW + SCAN_WIDTH * 4);

    /*
     * The pointer, or an idle path when there has never been one.
     *
     * 390×844 is the test viewport and touch devices have no hovering pointer,
     * so most visitors would otherwise get nothing from the trail at all. The
     * idle path is two sines on the shared clock — no extra asset, no extra
     * listener, nothing loaded to do it.
     */
    let px: number;
    let py: number;
    if (pointer.current.seen) {
      px = pointer.current.x;
      py = pointer.current.y;
    } else {
      px = 0.5 + 0.3 * Math.sin(c.elapsed * 0.31);
      py = 0.45 + 0.22 * Math.sin(c.elapsed * 0.47 + 1.1);
    }
    // Eased, so a fast mouse does not snap the parallax.
    gpu.uPointer.value.x += (px - gpu.uPointer.value.x) * 0.08;
    gpu.uPointer.value.y += (py - gpu.uPointer.value.y) * 0.08;

    // --- the ring buffer, written in place --------------------------------
    if (c.elapsed >= c.nextSample) {
      c.nextSample = c.elapsed + 1 / TRAIL_HZ;
      const aspect = gpu.uAspect.value;
      /*
       * The trail's own depth sweeps the phone's range on the shared cycle, so
       * over 26 s it passes behind the near face and back out in front of the far
       * one. A fixed depth would still be occluded correctly, but you would have
       * to already know to look for it.
       */
      const depth =
        SUBJECT_DEPTH_LOW -
        0.14 +
        (SUBJECT_DEPTH_HIGH - SUBJECT_DEPTH_LOW + 0.14) * gpu.uCycle.value;
      const slot = gpu.trailData[c.head];
      if (slot) slot.set(px * aspect, py, depth, c.elapsed);
      c.head = (c.head + 1) % TRAIL;
    }

    /*
     * The bounding circle the shader's early-out tests against. Computed from
     * the live samples only — an expired sample must not keep the loop switched
     * on for a region the trail has already left.
     */
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const sample of gpu.trailData) {
      if (sample.w < 0 || c.elapsed - sample.w > TRAIL_LIFE) continue;
      minX = Math.min(minX, sample.x);
      maxX = Math.max(maxX, sample.x);
      minY = Math.min(minY, sample.y);
      maxY = Math.max(maxY, sample.y);
    }
    if (minX === Infinity || !trail) {
      gpu.uTrailBounds.value.set(0, 0, 0, 0);
    } else {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      gpu.uTrailBounds.value.set(
        cx,
        cy,
        Math.hypot(maxX - cx, maxY - cy) + TRAIL_HEAD_R * 1.2,
        0,
      );
    }

    // Last, and only once the uniforms above are all current for this frame.
    gpu.pipeline.render();

    if (!c.shown) {
      c.shown = true;
      onFirstFrame();
    }
  }, 1);
  /* eslint-enable react-hooks/immutability */

  return (
    <mesh scale={[viewport.width, viewport.height, 1]} material={gpu.material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

/**
 * A3's host: loads the two textures, then mounts the canvas over the poster.
 *
 * The textures are loaded here rather than with a suspending loader so that a
 * failure has somewhere to go. If either request fails the component renders
 * nothing at all and the server-rendered poster underneath simply stays — which
 * is the same contract A1 and A2 have, and it is why the poster is permanent
 * rather than a placeholder that gets swapped out.
 */
export function DepthField({ dir, active, locale }: HeroLayerProps) {
  const [assets, setAssets] = useState<Assets | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const urls = ASSETS[dir];
    const loader = new TextureLoader();
    const load = (url: string, isData: boolean) =>
      new Promise<Texture>((resolve, reject) => {
        loader.load(
          url,
          (map) => {
            resolve(configure(map, isData));
          },
          undefined,
          reject,
        );
      });

    Promise.all([load(urls.base, false), load(urls.depth, true)])
      .then(([base, depth]) => {
        if (cancelled) {
          base.dispose();
          depth.dispose();
          return;
        }
        setAssets({ base, depth });
      })
      .catch(() => {
        // Poster stays. Nothing to report to the visitor.
      });

    return () => {
      cancelled = true;
    };
    // `dir` is a real dependency, not a lint appeasement: the two directions load
    // *different files*, so a language change without this keeps the previous
    // direction's composite and the phone ends up mirrored against its anchor.
    // The textures it replaces are disposed by `DepthPlane`'s teardown, which is
    // keyed on the same `assets` object this sets.
  }, [dir]);

  return (
    <>
      {assets ? (
        <Canvas
          aria-hidden="true"
          dpr={[1, MAX_DPR]}
          // `never` stops the loop rather than throttling it, same as A2.
          frameloop={active ? 'always' : 'never'}
          // Orthographic at zoom 1 puts one world unit on one CSS pixel, so the
          // plane below is scaled to the viewport and fills the frame exactly —
          // no fitting maths, and it stays correct through a resize.
          orthographic
          camera={{ position: [0, 0, 1], near: 0.01, far: 10, zoom: 1 }}
          /*
           * The async `gl` factory r3f 9 awaits. `renderer.init()` is resolved
           * here, which is the documented replacement for the deprecated
           * `renderAsync()` — it means the pipeline's synchronous `render()` in
           * the frame callback can never run against an uninitialised device.
           *
           * `WebGPURenderer` selects its own WebGL2 backend where WebGPU is
           * absent. There is no second code path for that case.
           */
          gl={async (props) => {
            const renderer = new WebGPURenderer({
              canvas: props.canvas as HTMLCanvasElement,
              antialias: true,
              alpha: false,
              powerPreference: 'low-power',
            });
            renderer.outputColorSpace = SRGBColorSpace;
            await renderer.init();
            return renderer;
          }}
          className={`h-full w-full transition-opacity duration-700 ${
            ready ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <DepthPlane
            assets={assets}
            dir={dir}
            onFirstFrame={() => {
              setReady(true);
            }}
          />
        </Canvas>
      ) : null}
      <HeroWords dir={dir} locale={locale} visible={ready} />
    </>
  );
}

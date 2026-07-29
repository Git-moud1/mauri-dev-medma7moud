'use client';

import { useEffect, useRef, useState } from 'react';

import { cappedDpr } from './capability';
import type { HeroLayerProps } from './HeroCanvas';
import { observeTheme, readRgbToken, type Rgb01 } from './tokens';

/**
 * CONCEPT A1 — one blueprint, two frames. Hand-written GLSL on plain WebGL.
 *
 * No three.js, no r3f, no shader library: a single fullscreen triangle pair and
 * one fragment shader. The geometry is signed-distance fields, so the "frames"
 * are evaluated per pixel rather than being meshes — which is what keeps this
 * at a few KB instead of a few hundred.
 *
 * The idea, in one line: the same lattice is bent twice, once into a wide
 * viewport and once into a phone, and the fold is continuous so it reads as one
 * surface rather than two objects.
 */

const VERTEX_SHADER = `#version 100
precision highp float;
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Fragment shader. Notes on the parts that are not obvious:
 *
 * - `uFold` runs 0..1 and back on a long sine. At 0 the lattice is a flat
 *   ground plane; at 1 the two frames stand. Because it eases both ways the
 *   composition resolves and dissolves instead of looping visibly.
 * - `uMirror` is +1 or -1 and flips x. RTL is not a CSS transform on the canvas
 *   because that would also mirror the lighting; the fold and the light source
 *   have to mirror together, so it happens in shader space.
 * - Lines are drawn with `fwidth` rather than a fixed threshold. A fixed
 *   threshold aliases badly once the plane is sheared, and this is the whole
 *   reason the lattice looks like drafting rather than like moire.
 * - There is exactly one light source, `LIGHT`. Every glow term reads from it.
 *   Two sources is what turns a violet accent into uniform purple.
 */
const FRAGMENT_SHADER = `#version 100
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform float uFold;
uniform float uMirror;
uniform vec3  uGlow1;
uniform vec3  uGlow2;
uniform vec3  uInk;

const vec2 LIGHT = vec2(-0.42, 0.34);

float roundedRect(vec2 p, vec2 half_, float r) {
  vec2 d = abs(p) - half_ + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

// Crisp, resolution-independent lattice. Returns line coverage in 0..1.
float lattice(vec2 p, float pitch) {
  vec2 g = abs(fract(p / pitch - 0.5) - 0.5) * pitch;
  vec2 w = fwidth(p) * 1.2 + 1e-5;
  vec2 line = 1.0 - smoothstep(vec2(0.0), w, g);
  return clamp(max(line.x, line.y), 0.0, 1.0);
}

// The fold: a shear plus a vertical squash, amount driven by uFold. This is the
// same matrix shape the static poster uses, so the two compositions agree.
vec2 foldPlane(vec2 p, float shear, float squash, vec2 offset, float amount) {
  vec2 q = p - offset;
  float s = mix(0.0, shear, amount);
  float k = mix(1.0, squash, amount);
  return vec2(q.x + s * q.y, q.y / k);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;
  uv.x *= uMirror;

  float fold = uFold;

  // --- the ground plane the frames rise out of -----------------------------
  vec2 ground = vec2(uv.x, uv.y + 0.30);
  ground.y = ground.y / max(0.12, 0.55 + 0.45 * fold);
  float groundMask = smoothstep(0.02, 0.42, -uv.y - 0.06);
  float groundLines = lattice(ground + vec2(uTime * 0.012, 0.0), 0.075) * groundMask * 0.42;

  // --- fold 1: a wide viewport --------------------------------------------
  vec2 wide = foldPlane(uv, -0.34, 0.86, vec2(-0.44, 0.02), fold);
  float wideSdf = roundedRect(wide, vec2(0.40, 0.245), 0.022);
  float wideFill = 1.0 - smoothstep(-0.004, 0.004, wideSdf);
  float wideEdge = exp(-abs(wideSdf) * 190.0);
  float wideGrid = lattice(wide + vec2(0.0, uTime * -0.010), 0.036) * wideFill * 0.62;
  // The title bar, so the shape reads as a browser and not just a rectangle.
  float wideBar = (1.0 - smoothstep(0.0, 0.0035, abs(wide.y - 0.196))) * wideFill;

  // --- fold 2: the same plane, narrowed into a phone -----------------------
  vec2 tall = foldPlane(uv, 0.30, 0.90, vec2(0.47, -0.01), fold);
  float tallSdf = roundedRect(tall, vec2(0.105, 0.275), 0.040);
  float tallFill = 1.0 - smoothstep(-0.004, 0.004, tallSdf);
  float tallEdge = exp(-abs(tallSdf) * 190.0);
  float tallGrid = lattice(tall + vec2(0.0, uTime * -0.010), 0.036) * tallFill * 0.62;
  float tallNotch =
      (1.0 - smoothstep(0.0, 0.006, roundedRect(tall - vec2(0.0, 0.238), vec2(0.030, 0.005), 0.005)))
      * tallFill;

  // --- the seam: proof the lattice is continuous through the fold ----------
  float seamPath = abs(uv.y + 0.11 + 0.16 * uv.x - 0.055 * sin(uv.x * 5.2 + uTime * 0.22));
  float seamBand = smoothstep(0.44, -0.02, abs(uv.x));
  float dash = step(0.42, fract(uv.x * 13.0 - uTime * 0.20));
  float seam = exp(-seamPath * 210.0) * seamBand * dash * fold;

  // --- one light source ----------------------------------------------------
  float toLight = length(uv - LIGHT);
  float glow = exp(-toLight * 1.85);
  vec3 lightCol = mix(uGlow1, uGlow2, clamp(toLight * 0.95, 0.0, 1.0));

  float structure = max(max(wideGrid, tallGrid), groundLines);
  float edges = (wideEdge + tallEdge) * (0.30 + 0.70 * fold);
  float chrome = wideBar * 0.55 + tallNotch * 0.75;

  vec3 col = uInk;
  col += lightCol * glow * 0.34;                       // ambient bleed
  col += lightCol * structure * (0.34 + 0.42 * glow);  // lit lattice
  col += lightCol * edges * (0.55 + 0.60 * glow);      // frame edges
  col += lightCol * (chrome + seam) * 0.85;

  // Falls away before the headline's band so text never sits on the busiest
  // part of the drawing. The <h1> owns the top of the hero.
  float headroom = smoothstep(0.46, 0.04, uv.y);
  col = mix(uInk, col, headroom);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function ShaderLattice({ dir, active }: HeroLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  /*
   * `active` and `dir` reach the render loop through refs, written in an effect
   * rather than during render.
   *
   * The loop reads them each frame instead of closing over them, so neither a
   * scroll nor a language change tears down and rebuilds the GL program — and
   * writing a ref during render is exactly the pattern that makes a component
   * fail to update, so the sync happens after commit.
   */
  const activeRef = useRef(active);
  const mirrorRef = useRef(dir === 'rtl' ? -1 : 1);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    mirrorRef.current = dir === 'rtl' ? -1 : 1;
  }, [dir]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
      // Without this the compositor may hand back a cleared buffer on the frame
      // after a pause, which shows as a one-frame black flash.
      preserveDrawingBuffer: false,
    });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    // `createProgram` is typed non-nullable by @types/webgl, so only the two
    // shaders are checked here.
    const program = gl.createProgram();
    if (!vertex || !fragment) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'uRes');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uFold = gl.getUniformLocation(program, 'uFold');
    const uMirror = gl.getUniformLocation(program, 'uMirror');
    const uGlow1 = gl.getUniformLocation(program, 'uGlow1');
    const uGlow2 = gl.getUniformLocation(program, 'uGlow2');
    const uInk = gl.getUniformLocation(program, 'uInk');

    // Colours come from the same CSS tokens the rest of the site uses, read
    // once per theme change, so the canvas cannot drift from the palette.
    let glow1: Rgb01 = [0.55, 0.36, 0.96];
    let glow2: Rgb01 = [0.23, 0.51, 0.96];
    let ink: Rgb01 = [0.04, 0.05, 0.06];
    const readTheme = () => {
      const styles = getComputedStyle(document.documentElement);
      glow1 = readRgbToken(styles, '--glow-1', glow1);
      glow2 = readRgbToken(styles, '--glow-2', glow2);
      ink = readRgbToken(styles, '--bg', ink);
    };
    readTheme();

    const stopWatchingTheme = observeTheme(readTheme);

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = cappedDpr();
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (w === width && h === height) return;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let frame = 0;
    let shown = false;
    let start = 0;
    // Held across pauses so the fold does not jump when the hero comes back.
    let elapsed = 0;
    let lastStamp = 0;

    const draw = (stamp: number) => {
      if (start === 0) start = stamp;
      if (lastStamp !== 0) elapsed += Math.min(stamp - lastStamp, 64) / 1000;
      lastStamp = stamp;

      resize();
      // 0..1 and back, ~26 s round trip: slow enough to read as deliberate
      // rather than as a loop.
      const fold = 0.5 - 0.5 * Math.cos(elapsed * 0.24);

      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, elapsed);
      gl.uniform1f(uFold, fold);
      gl.uniform1f(uMirror, mirrorRef.current);
      gl.uniform3fv(uGlow1, glow1);
      gl.uniform3fv(uGlow2, glow2);
      gl.uniform3fv(uInk, ink);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Once, on the first drawn frame. Calling this every frame would enqueue a
      // React update 60 times a second for a value that never changes again.
      if (!shown) {
        shown = true;
        setReady(true);
      }

      if (activeRef.current) {
        frame = requestAnimationFrame(draw);
      } else {
        frame = 0;
        lastStamp = 0;
      }
    };

    frame = requestAnimationFrame(draw);

    // Restarting is its own effect-free path: when `active` flips back on, the
    // parent re-renders and this effect does not re-run, so the loop is woken
    // by the poll below rather than by a dependency change. A 250 ms poll costs
    // nothing next to a render loop and avoids rebuilding the GL program.
    const wake = window.setInterval(() => {
      if (activeRef.current && frame === 0) frame = requestAnimationFrame(draw);
    }, 250);

    return () => {
      window.clearInterval(wake);
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
      stopWatchingTheme();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      // Frees the context immediately instead of waiting for GC. Browsers cap
      // live contexts per document, and the concept switch can mount the other
      // concept in the same session.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // Fades in over the poster underneath once a frame has actually been
      // drawn, so the handover is a crossfade rather than a pop — and so a
      // context that fails after creation leaves the poster showing instead of
      // fading up to an empty canvas.
      className={`h-full w-full transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}

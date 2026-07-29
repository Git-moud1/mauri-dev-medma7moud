'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { MAX_DPR } from './capability';
import type { HeroLayerProps } from './HeroCanvas';
import { observeTheme, readRgbToken, type Rgb01 } from './tokens';

/**
 * CONCEPT A2 — the same fold, as real 3D. three.js / react-three-fiber.
 *
 * Identical metaphor to A1 on purpose: one lattice bent twice, into a wide
 * viewport and a phone. The comparison is only meaningful if the *idea* is held
 * constant and only the technique changes.
 *
 * What the weight actually buys, and the only reason to consider shipping it:
 *
 *   - The frames are extruded solids with thickness, so the single light source
 *     genuinely shades them — near edges catch it, far edges fall into the
 *     charcoal. A1 fakes this with a distance falloff and cannot show a frame's
 *     inner wall at all.
 *   - The fold is a real rotation in perspective, so the lattice foreshortens
 *     correctly as each plane turns. A1's fold is a 2D shear, which is
 *     convincing head-on and wrong at the extremes.
 *   - Depth ordering is free: the phone can pass in front of the viewport.
 *
 * What it costs is measured on the deploy, not estimated here.
 */

/** Rounded-rectangle outline as a `THREE.Shape`, in local units. */
function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);
  return shape;
}

/**
 * An extruded frame: a rounded rect with a smaller rounded rect punched out, so
 * it has an inner wall for the light to catch. This is the geometry A1 cannot
 * express.
 */
function frameGeometry(width: number, height: number, radius: number, bezel: number) {
  const outer = roundedRectShape(width, height, radius);
  outer.holes.push(
    roundedRectShape(
      width - bezel * 2,
      height - bezel * 2,
      Math.max(0.001, radius - bezel),
    ),
  );
  return new THREE.ExtrudeGeometry(outer, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
    curveSegments: 6,
  });
}

/** Line-segment lattice. The shared grid, at one pitch for every surface. */
function latticeGeometry(width: number, height: number, pitch: number) {
  const points: number[] = [];
  const cols = Math.max(1, Math.round(width / pitch));
  const rows = Math.max(1, Math.round(height / pitch));
  for (let i = 0; i <= cols; i++) {
    const x = -width / 2 + (i * width) / cols;
    points.push(x, -height / 2, 0, x, height / 2, 0);
  }
  for (let j = 0; j <= rows; j++) {
    const y = -height / 2 + (j * height) / rows;
    points.push(-width / 2, y, 0, width / 2, y, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

interface Palette {
  glow1: THREE.Color;
  glow2: THREE.Color;
  ink: THREE.Color;
}

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: Rgb01) => {
    const [r, g, b] = readRgbToken(styles, name, fallback);
    return new THREE.Color(r, g, b);
  };
  return {
    glow1: read('--glow-1', [0.55, 0.36, 0.96]),
    glow2: read('--glow-2', [0.23, 0.51, 0.96]),
    ink: read('--bg', [0.04, 0.05, 0.06]),
  };
}

/** Tracks the `dark` class so the scene follows the theme toggle. */
function usePalette(): Palette {
  const [palette, setPalette] = useState<Palette>(readPalette);
  useEffect(
    () =>
      observeTheme(() => {
        setPalette(readPalette());
      }),
    [],
  );
  return palette;
}

function Scene({ mirror, palette }: { mirror: number; palette: Palette }) {
  const wide = useRef<THREE.Group>(null);
  const tall = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);

  const wideFrame = useMemo(() => frameGeometry(2.5, 1.55, 0.09, 0.045), []);
  const tallFrame = useMemo(() => frameGeometry(0.78, 1.62, 0.14, 0.035), []);
  const wideGrid = useMemo(() => latticeGeometry(2.38, 1.44, 0.16), []);
  const tallGrid = useMemo(() => latticeGeometry(0.68, 1.52, 0.16), []);
  const ground = useMemo(() => latticeGeometry(16, 12, 0.16), []);

  useEffect(
    () => () => {
      for (const geometry of [wideFrame, tallFrame, wideGrid, tallGrid, ground]) {
        geometry.dispose();
      }
    },
    [wideFrame, tallFrame, wideGrid, tallGrid, ground],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // The same 0..1-and-back fold as A1, at the same rate, so the two concepts
    // are compared at matching moments rather than at whatever phase they
    // happen to be in.
    const fold = 0.5 - 0.5 * Math.cos(t * 0.24);
    if (wide.current) {
      wide.current.rotation.y = mirror * (0.62 - 0.34 * fold);
      wide.current.rotation.x = -0.16 * fold;
      wide.current.position.y = -0.28 + 0.5 * fold;
    }
    if (tall.current) {
      tall.current.rotation.y = mirror * (-0.78 + 0.36 * fold);
      tall.current.rotation.x = 0.1 * fold;
      tall.current.position.y = -0.34 + 0.52 * fold;
    }
    // One source, drifting slightly so the shading is never completely static.
    if (light.current) {
      light.current.position.set(
        mirror * (-2.1 + Math.sin(t * 0.18) * 0.35),
        1.9,
        2.4 + Math.cos(t * 0.14) * 0.3,
      );
    }
  });

  const frameMaterial = (
    <meshStandardMaterial
      color={palette.glow1}
      emissive={palette.glow2}
      emissiveIntensity={0.16}
      metalness={0.72}
      roughness={0.28}
    />
  );

  return (
    <>
      {/* Fog in the page's own background colour is what makes the far edge of
          the ground plane dissolve into the charcoal instead of ending on a
          visible line. Declared rather than assigned onto the scene object from
          a hook — mutating what `useThree` returns is reaching past r3f. */}
      <fog attach="fog" args={[palette.ink, 4.2, 11]} />
      <ambientLight intensity={0.22} color={palette.glow2} />
      <pointLight
        ref={light}
        intensity={26}
        distance={14}
        decay={2}
        color={palette.glow1}
      />

      {/* The ground plane both frames rise out of. */}
      <lineSegments
        geometry={ground}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.05, 0]}
      >
        <lineBasicMaterial color={palette.glow2} transparent opacity={0.2} fog />
      </lineSegments>

      <group ref={wide} position={[mirror * -1.32, -0.28, 0]}>
        <mesh geometry={wideFrame}>{frameMaterial}</mesh>
        <lineSegments geometry={wideGrid} position={[0, 0, 0.03]}>
          <lineBasicMaterial color={palette.glow1} transparent opacity={0.34} fog />
        </lineSegments>
      </group>

      <group ref={tall} position={[mirror * 1.42, -0.34, 0.5]}>
        <mesh geometry={tallFrame}>{frameMaterial}</mesh>
        <lineSegments geometry={tallGrid} position={[0, 0, 0.03]}>
          <lineBasicMaterial color={palette.glow1} transparent opacity={0.34} fog />
        </lineSegments>
      </group>
    </>
  );
}

export function MeshLattice({ dir, active }: HeroLayerProps) {
  const palette = usePalette();
  const mirror = dir === 'rtl' ? -1 : 1;

  return (
    <Canvas
      aria-hidden="true"
      // Same cap as A1, for the same reason: this is a soft background and the
      // top of a 3x range costs 9x the fragments for nothing visible.
      dpr={[1, MAX_DPR]}
      // The pause. `never` stops the loop entirely rather than throttling it,
      // and r3f resumes cleanly when it flips back.
      frameloop={active ? 'always' : 'never'}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      camera={{ position: [0, 0.45, 5.1], fov: 34 }}
      // Transparent, so the poster underneath shows through until the scene has
      // something to say — and if WebGL dies mid-session, the poster is what
      // remains visible.
      style={{ background: 'transparent' }}
    >
      <Scene mirror={mirror} palette={palette} />
    </Canvas>
  );
}

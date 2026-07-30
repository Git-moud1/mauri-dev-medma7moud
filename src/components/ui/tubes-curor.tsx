'use client';

import { useEffect, useRef } from 'react';
import type { TubesCursorApp } from 'threejs-components/build/cursors/tubes1.min.js';

// The main App component that encapsulates the animation
// In React, component names must start with a capital letter to be recognized as components.
// I've renamed the function from "component" to "TubesCursor".
export default function TubesCursor() {
  // useRef to get a persistent reference to the canvas element
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // useRef to hold the animation instance so we can call its methods
  const appRef = useRef<TubesCursorApp | null>(null);

  /**
   * Generates an array of random hex color strings.
   * @param count - The number of random colors to generate.
   * @returns An array of color strings.
   */
  const randomColors = (count: number) => {
    return new Array(count).fill(0).map(
      () =>
        '#' +
        Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, '0'),
    );
  };

  // This effect runs once when the component mounts
  useEffect(() => {
    // The error "Computed radius is NaN" suggests a race condition where the animation
    // library initializes before the canvas element has its final dimensions, leading
    // to invalid geometry calculations. Delaying the initialization with setTimeout
    // ensures the DOM is fully painted and ready.
    const initTimer = setTimeout(() => {
      // CHANGED FROM THE ORIGINAL, and it had to be: the original imports this from
      // `https://cdn.jsdelivr.net/npm/threejs-components@0.0.19/...`, which this site
      // blocks. `next.config.mjs` serves `script-src 'self' 'unsafe-inline'`, so the
      // CDN request never completes and the component renders a black rectangle with
      // no visible error. `threejs-components@0.0.19` is installed as a dependency
      // instead — same bytes, same version, same-origin, still code-split by the
      // dynamic import. Reverting this line means opening jsdelivr in the CSP.
      import('threejs-components/build/cursors/tubes1.min.js')
        .then((module) => {
          const TubesCursor = module.default;

          // Ensure the canvas element is still available before initializing
          if (canvasRef.current) {
            // Initialize the TubesCursor animation
            const app = TubesCursor(canvasRef.current, {
              tubes: {
                colors: ['#5e72e4', '#8965e0', '#f5365c'],
                lights: {
                  intensity: 200,
                  colors: ['#21d4fd', '#b721ff', '#f4d03f', '#11cdef'],
                },
              },
            });
            // Store the instance in our ref for later use
            appRef.current = app;
          }
        })
        .catch((err: unknown) => {
          console.error('Failed to load TubesCursor module:', err);
        });
    }, 100); // 100ms delay to allow for DOM rendering

    // Cleanup function to dispose of the animation and clear the timeout
    return () => {
      clearTimeout(initTimer);
      // Check if app was initialized and has a dispose method before calling
      if (appRef.current && typeof appRef.current.dispose === 'function') {
        appRef.current.dispose();
      }
    };
  }, []); // The empty dependency array ensures this effect runs only once

  // Handles click events on the main container
  const handleClick = () => {
    if (appRef.current) {
      const newTubeColors = randomColors(3);
      const newLightColors = randomColors(4);

      // Update the colors in the running animation
      appRef.current.tubes.setColors(newTubeColors);
      appRef.current.tubes.setLightsColors(newLightColors);
    }
  };

  /**
   * The same action from the keyboard.
   *
   * Without this the colour randomiser is mouse-only — a control no keyboard or
   * screen-reader user can reach, which `jsx-a11y` fails the build over and is
   * right to. Adding `role`, `tabIndex` and this handler keeps the original's
   * markup and its "click anywhere" behaviour while making the control real,
   * rather than suppressing the rule.
   *
   * Space is intercepted because its default action on a focused element is to
   * scroll the page.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    // Main container with full-screen styles and click handler
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Change the tube and light colours"
      className="h-screen w-screen cursor-pointer overflow-hidden bg-black font-['Montserrat',_sans-serif] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 focus-visible:outline-none"
    >
      {/* Canvas element for the animation, positioned behind everything else */}
      <canvas ref={canvasRef} className="fixed inset-0 z-0" />

      {/* Hero content displayed over the canvas */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2.5">
        {/* Using arbitrary values for text-shadow which doesn't have a default Tailwind utility */}
        <h1 className="m-0 p-0 text-[80px] leading-none font-bold text-white uppercase select-none [text-shadow:0_0_20px_rgba(0,0,0,1)]">
          Tubes
        </h1>
        <h2 className="m-0 p-0 text-[60px] leading-none font-medium text-white uppercase select-none [text-shadow:0_0_20px_rgba(0,0,0,1)]">
          Cursor
        </h2>
        <p className="m-0 p-0 text-xl leading-none text-white select-none [text-shadow:0_0_20px_rgba(0,0,0,1)]">
          Click to change colors
        </p>
      </div>
    </div>
  );
}

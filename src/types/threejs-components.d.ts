/**
 * Types for `threejs-components`, which ships none.
 *
 * The package's `package.json` declares no `types` field and no `.d.ts`, so
 * without this every import of it is an implicit `any` — which this repo's
 * `strict` + `typescript-eslint` strictTypeChecked config rejects outright, and
 * which would silently erase the return type of the factory the component then
 * calls methods on.
 *
 * The build entry is deep-imported (`build/cursors/tubes1.min.js`) rather than
 * taken from the package root, because the root `module` entry pulls in every
 * component the library has. Only the tubes cursor is wanted.
 *
 * The shape below is the surface the component actually uses. It is deliberately
 * not exhaustive: the library is undocumented and minified, so declaring methods
 * that were never verified to exist would be inventing an API.
 */
declare module 'threejs-components/build/cursors/tubes1.min.js' {
  export interface TubesCursorTubes {
    setColors(colors: string[]): void;
    setLightsColors(colors: string[]): void;
  }

  export interface TubesCursorApp {
    tubes: TubesCursorTubes;
    /**
     * Present at runtime in 0.0.19 but not guaranteed by any published contract,
     * so the component feature-tests it before calling rather than trusting this
     * declaration.
     */
    dispose?: () => void;
  }

  export interface TubesCursorConfig {
    tubes?: {
      colors?: string[];
      lights?: {
        intensity?: number;
        colors?: string[];
      };
    };
  }

  export default function TubesCursor(
    canvas: HTMLCanvasElement,
    config?: TubesCursorConfig,
  ): TubesCursorApp;
}

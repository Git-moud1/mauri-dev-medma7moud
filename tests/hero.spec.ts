import { test, expect, type Page } from '@playwright/test';

/**
 * The hero's non-negotiables from the plan-3 brief, asserted rather than
 * assumed.
 *
 * These are deliberately about *guarantees*, not about looks: that the headline
 * does not depend on the canvas, that the canvas cannot move it, that every
 * documented fallback actually engages, and that the composition mirrors in
 * Arabic. A screenshot test would fail on every deliberate design tweak; these
 * fail only when a promise breaks.
 */

const LOCALES = ['ar', 'en', 'fr'] as const;

const layer = (page: Page) => page.locator('[data-hero-layer]');

/**
 * Asserts the branch the layer host settled on, via a retrying matcher.
 *
 * It has to retry. The host is in the server HTML carrying `poster`/`ssr` — that
 * is the honest answer before any browser API has been read — and the real value
 * only appears once the island hydrates. A one-shot `getAttribute` after
 * `waitFor({ state: 'attached' })` resolves against the pre-hydration markup, so
 * it reads `poster` no matter what the device supports. Every fallback assertion
 * here would have passed for that reason rather than on its merits.
 */
async function expectHeroLayer(page: Page, expected: RegExp | string): Promise<void> {
  await expect(layer(page)).toHaveAttribute('data-hero-layer', expected);
}

test.describe('the headline does not depend on the animated layer', () => {
  for (const locale of LOCALES) {
    /**
     * The whole point of the poster being a server component. With JavaScript
     * disabled there is no canvas, no capability probe and no hydration — and
     * the `<h1>` and its still composition must both still be there.
     */
    test(`${locale}: the h1 and the poster render without JavaScript`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(`/${locale}`);

      await expect(page.locator('h1')).toBeVisible();
      // The poster is inline SVG inside the hero, so it is in the HTML itself.
      await expect(page.locator('#top svg').first()).toBeAttached();
      // And no canvas was created, because nothing ran to create one.
      await expect(page.locator('#top canvas')).toHaveCount(0);

      await context.close();
    });
  }

  test('the h1 is not inside the layer that carries the canvas', async ({ page }) => {
    await page.goto('/ar');
    // If the headline ever ends up inside the animated layer, the layer's
    // opacity, transforms and pointer-events all start applying to it.
    await expect(page.locator('[data-hero-layer] h1')).toHaveCount(0);
  });
});

test.describe('the canvas cannot shift the layout', () => {
  test('the h1 box is identical before and after the layer mounts', async ({ page }) => {
    await page.goto('/ar', { waitUntil: 'domcontentloaded' });
    const heading = page.locator('h1');
    await heading.waitFor();
    const before = await heading.boundingBox();

    // Let the island mount, probe capability and (where supported) draw.
    await page.waitForLoadState('load');
    await page.waitForTimeout(1200);
    const after = await heading.boundingBox();

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after?.x).toBeCloseTo(before?.x ?? -1, 1);
    expect(after?.y).toBeCloseTo(before?.y ?? -1, 1);
    expect(after?.width).toBeCloseTo(before?.width ?? -1, 1);
  });

  test('the layer is absolutely positioned, so it has no size to contribute', async ({
    page,
  }) => {
    await page.goto('/ar');
    await expect(layer(page)).toHaveCSS('position', 'absolute');
  });
});

test.describe('every documented fallback engages', () => {
  /**
   * Reduced motion must produce the still composed frame — the poster — and
   * explicitly not a canvas. "Not nothing and not broken" is the brief's wording,
   * so the assertion is that the poster is still there.
   */
  test('prefers-reduced-motion gets the still poster and no canvas', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/ar');

    await expectHeroLayer(page, 'still');
    await expect(layer(page)).toHaveAttribute('data-hero-reason', 'reduced-motion');
    await expect(page.locator('#top canvas')).toHaveCount(0);
    await expect(page.locator('#top svg').first()).toBeAttached();
  });

  test('a device without WebGL gets the poster rather than a black rectangle', async ({
    page,
  }) => {
    // Deny every context type the probe tries, which is exactly the shape of the
    // failure the probe exists to catch: the API is present and returns null.
    await page.addInitScript(() => {
      // Fetched with `Reflect.get` rather than as `proto.getContext`: reading a
      // method off a prototype into a variable is an unbound method reference,
      // and the forwarding call below needs an explicit `this` anyway.
      const original = Reflect.get(HTMLCanvasElement.prototype, 'getContext') as (
        this: HTMLCanvasElement,
        id: string,
        options?: unknown,
      ) => unknown;
      function patched(this: HTMLCanvasElement, id: string, options?: unknown) {
        if (id === 'webgl' || id === 'webgl2' || id === 'experimental-webgl') return null;
        return original.call(this, id, options);
      }
      HTMLCanvasElement.prototype.getContext =
        patched as typeof HTMLCanvasElement.prototype.getContext;
    });
    await page.goto('/ar');

    await expectHeroLayer(page, 'poster');
    await expect(layer(page)).toHaveAttribute('data-hero-reason', 'no-webgl');
    await expect(page.locator('#top canvas')).toHaveCount(0);
  });

  test('save-data gets the poster', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { saveData: true },
      });
    });
    await page.goto('/ar');

    await expectHeroLayer(page, 'poster');
    await expect(layer(page)).toHaveAttribute('data-hero-reason', 'save-data');
  });

  test('a two-core device gets the poster', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        configurable: true,
        value: 2,
      });
    });
    await page.goto('/ar');

    await expectHeroLayer(page, 'poster');
    await expect(layer(page)).toHaveAttribute('data-hero-reason', 'low-end');
  });
});

test.describe('the concept switch', () => {
  test('defaults to the shader concept with no query param', async ({ page }) => {
    await page.goto('/ar');
    // On a headless runner WebGL may be unavailable, in which case the poster is
    // the correct answer and the default cannot be observed. Asserting "a1 or a
    // documented fallback" keeps this meaningful without making it flaky.
    await expectHeroLayer(page, /^(a1|poster|still)$/);
  });

  test('?hero=a2 selects the 3D concept', async ({ page }) => {
    await page.goto('/ar?hero=a2');
    await expectHeroLayer(page, /^(a2|poster|still)$/);
  });

  test('an unrecognised value falls back to the default rather than rendering nothing', async ({
    page,
  }) => {
    await page.goto('/ar?hero=nonsense');
    await expectHeroLayer(page, /^(a1|poster|still)$/);
  });
});

test.describe('RTL is not a port', () => {
  test('the poster composition mirrors on Arabic and does not on latin', async ({
    page,
  }) => {
    await page.goto('/ar');
    await expect(page.locator('#top svg').first()).toHaveAttribute(
      'style',
      /scaleX\(-1\)/,
    );

    await page.goto('/en');
    const latin = await page.locator('#top svg').first().getAttribute('style');
    expect(latin ?? '').not.toContain('scaleX(-1)');
  });

  test('the hero stats keep their digits in reading order under Arabic', async ({
    page,
  }) => {
    await page.goto('/ar');
    // The stats are `5+` style figures. Whatever the locale, the digit must
    // precede the plus sign visually — a reversed run would render `+5`.
    const first = page.locator('#top .grid > div').first();
    await expect(first).toBeVisible();
    const text = (await first.innerText()).trim();
    expect(text).toMatch(/^\d+\+/m);
  });
});

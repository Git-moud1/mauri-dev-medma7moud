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

  /**
   * A3's backdrop is a photograph with charcoal baked in. On the light palette
   * the hero's near-black `--fg` headline would sit on that dark image and stop
   * being readable, so A3 declines the palette and the poster stays.
   *
   * A1 reads `--bg` live and must NOT be affected — asserted below, because a
   * check that blocked every concept would pass this test and quietly delete two
   * of them.
   */
  test('A3 declines the light palette and hands back the poster', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/en?hero=a3');

    await expectHeroLayer(page, /^(poster|still)$/);
    if ((await layer(page).getAttribute('data-hero-layer')) === 'poster') {
      await expect(layer(page)).toHaveAttribute(
        'data-hero-reason',
        /light-palette|no-webgl/,
      );
    }
    await expect(page.locator('#top svg').first()).toBeAttached();
  });

  test('A1 is unaffected by the light palette', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/en');
    await expectHeroLayer(page, /^(a1|poster|still)$/);
    // Whatever happened, it was not the palette that caused it.
    const reason = await layer(page).getAttribute('data-hero-reason');
    expect(reason).not.toBe('light-palette');
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

  test('?hero=a3 selects the depth-map concept', async ({ page }) => {
    // Charcoal, because A3 declines the light palette and Playwright defaults to
    // light — without this the assertion would pass on the `poster` branch every
    // time and never once observe the concept it names.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/ar?hero=a3');
    await expectHeroLayer(page, /^(a3|poster|still)$/);
  });

  test('an unrecognised value falls back to the default rather than rendering nothing', async ({
    page,
  }) => {
    await page.goto('/ar?hero=nonsense');
    await expectHeroLayer(page, /^(a1|poster|still)$/);
  });

  /**
   * A value one character away from a real concept must not select it. The
   * switch resolves against an explicit list rather than testing `!== 'a1'`, and
   * this is the assertion that keeps it that way — a `startsWith` or a truthiness
   * check would pass every other test in this file and fail here.
   */
  test('a near-miss on a real concept still falls back to the default', async ({
    page,
  }) => {
    await page.goto('/ar?hero=a33');
    await expectHeroLayer(page, /^(a1|poster|still)$/);
  });

  /**
   * `?trail=0` exists so the pointer trail's cost can be measured as an
   * increment. It is a shader switch and must not be able to change which
   * concept renders.
   */
  test('the trail measurement switch does not change the concept', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/ar?hero=a3&trail=0');
    await expectHeroLayer(page, /^(a3|poster|still)$/);
  });
});

test.describe("A3's text overlay", () => {
  /**
   * Every assertion here needs A3 to have actually engaged, which needs WebGL on
   * the runner. Skipping when it did not is deliberate rather than lazy: the
   * alternative is asserting against a hero that is showing the poster, which
   * would pass for the wrong reason on exactly the machines where it matters
   * least.
   */
  async function gotoA3(page: Page, locale: string): Promise<boolean> {
    // A3 declines the light palette, and Playwright's default colour scheme is
    // light — without this every assertion below would skip for the wrong reason.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`/${locale}?hero=a3`);

    /*
     * Wait for the a3 value specifically, not for "a3 or a fallback".
     *
     * The server renders `data-hero-layer="poster"`, so a matcher that accepts
     * the fallback is satisfied by the pre-hydration markup the instant the
     * document arrives — and then reads `poster` every time, whatever the browser
     * was capable of. That is how these tests came to skip on a runner that could
     * in fact render A3: not a capability problem, a race the assertion could not
     * lose. The timeout is generous because A3 fetches a 414 KB chunk and two
     * textures before it can draw.
     */
    return await page
      .locator('[data-hero-layer="a3"]')
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
  }

  test('the scroll affordance is keyboard reachable and shows a focus ring', async ({
    page,
  }) => {
    test.skip(!(await gotoA3(page, 'en')), 'A3 did not engage on this runner');

    const scroll = page.locator('#top a[href="#projects"]').last();
    await expect(scroll).toBeVisible();

    // Focused programmatically rather than by tabbing: the number of tab stops
    // ahead of it depends on whether the WhatsApp CTA is published, which is
    // admin state and not this test's subject.
    await scroll.focus();
    await expect(scroll).toBeFocused();

    // The ring has to be a real, visible outline — `outline: none` with nothing
    // replacing it is the failure this catches.
    const ring = await scroll.evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        outline: styles.outlineStyle,
        shadow: styles.boxShadow,
      };
    });
    expect(ring.outline !== 'none' || ring.shadow !== 'none').toBe(true);
  });

  test('the overlay does not swallow clicks meant for the CTAs underneath it', async ({
    page,
  }) => {
    test.skip(!(await gotoA3(page, 'en')), 'A3 did not engage on this runner');
    // The primary CTA sits under the overlay's box. If the overlay were not
    // `pointer-events-none`, this would time out.
    await expect(page.locator('#top a[href="#projects"]').first()).toBeVisible();
    await page.locator('#top a[href="#projects"]').first().click({ timeout: 5000 });
  });

  test('uppercase is not applied on Arabic', async ({ page }) => {
    test.skip(!(await gotoA3(page, 'ar')), 'A3 did not engage on this runner');

    // Arabic has no case, so the class is inert at best and interferes with
    // shaping at worst.
    const label = page.locator('[data-hero-layer] p').first();
    await expect(label).toHaveCSS('text-transform', 'none');
  });

  test('uppercase IS applied on latin, so the Arabic gate is doing something', async ({
    page,
  }) => {
    test.skip(!(await gotoA3(page, 'en')), 'A3 did not engage on this runner');
    const label = page.locator('[data-hero-layer] p').first();
    await expect(label).toHaveCSS('text-transform', 'uppercase');
  });

  test('the overlay carries no second h1', async ({ page }) => {
    test.skip(!(await gotoA3(page, 'en')), 'A3 did not engage on this runner');
    // The server-rendered headline is the LCP element and the only h1. A3's
    // word-by-word reveal points at the project in the image instead.
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('[data-hero-layer] h1')).toHaveCount(0);
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

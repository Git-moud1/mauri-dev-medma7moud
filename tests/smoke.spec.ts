import { test, expect } from '@playwright/test';
import { dictionaries } from '../src/i18n/dictionaries';

/**
 * The theme toggle's accessible name is localized, and the site's default
 * locale is Arabic — so an English-only matcher never finds the button.
 * Build the matcher from the dictionaries themselves so it holds for whichever
 * locale the page happens to render, and follows the copy if it ever changes.
 */
const THEME_TOGGLE_NAME = new RegExp(
  `^(${Object.values(dictionaries)
    .flatMap((dict) => [dict.theme.toLight, dict.theme.toDark])
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})$`,
  'i',
);

test('home page renders a single h1 and the hero CTAs', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByRole('link', { name: /whatsapp/i }).first()).toBeVisible();
});

test('html carries a lang and a dir attribute', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', /^(ar|en|fr)$/);
  await expect(html).toHaveAttribute('dir', /^(rtl|ltr)$/);
});

test('theme toggle flips the dark class', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const before = await html.getAttribute('class');
  await page.getByRole('button', { name: THEME_TOGGLE_NAME }).click();
  await expect(html).not.toHaveClass(before ?? '');
});

test('clicking a project card opens the lightbox dialog', async ({ page }) => {
  await page.goto('/');
  await page.locator('#projects').scrollIntoViewIfNeeded();
  await page.locator('#projects article button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('no console errors on load', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});

test('root redirects to a locale route', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.url()).toMatch(/\/(ar|en|fr)$/);
});

test.describe('localized routes', () => {
  for (const [locale, dir] of [
    ['ar', 'rtl'],
    ['en', 'ltr'],
    ['fr', 'ltr'],
  ] as const) {
    test(`/${locale} renders with lang=${locale} dir=${dir}`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      await expect(page.locator('h1')).toHaveCount(1);
    });
  }
});

test('an unsupported locale segment 404s', async ({ page }) => {
  const response = await page.goto('/de');
  expect(response?.status()).toBe(404);
});

test('legacy localStorage locale migrates to a cookie and is honoured', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('bc-locale', 'fr');
    } catch {}
  });
  await page.goto('/en'); // prime the origin so the shim runs
  await page.goto('/'); // now the proxy should read the migrated cookie

  expect(page.url()).toMatch(/\/fr$/);

  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'bc-locale')?.value).toBe('fr');

  const leftover = await page.evaluate(() => window.localStorage.getItem('bc-locale'));
  expect(leftover).toBeNull();
});

test.describe('scroll reveals', () => {
  /**
   * Every wrapper that must end up visible, and the section it belongs to.
   * `footer` has no `<Reveal>` of its own today, so the helper falls back to
   * the element itself — if it ever gains one, the same assertion covers it.
   */
  const SECTIONS = ['#about', '#projects', '#process', '#contact', 'footer'] as const;

  /**
   * Reads the computed opacity of every `.reveal` inside `selector`, falling
   * back to the element itself when it contains none. Deliberately uses
   * `getComputedStyle` rather than any Playwright visibility helper — see the
   * protected-test note below for why that distinction is the whole point.
   */
  async function revealOpacities(
    page: import('@playwright/test').Page,
    selector: string,
  ): Promise<number[]> {
    return page.evaluate((sel) => {
      const root = document.querySelector(sel);
      if (!root) return [];
      const reveals = [...root.querySelectorAll('.reveal')];
      const targets = reveals.length > 0 ? reveals : [root];
      return targets.map((el) => Number.parseFloat(getComputedStyle(el).opacity));
    }, selector);
  }

  /**
   * PROTECTED TEST — do not weaken, skip, or delete. Added in Task 10b.
   *
   * Playwright counts an element with `opacity: 0` as VISIBLE: it only checks
   * that the box has a non-empty bounding box and is not `display:none` /
   * `visibility:hidden`. Every reveal on this page ships with `opacity: 0` and
   * is only raised by an IntersectionObserver in `Reveal.tsx`. So if that
   * observer ever stops firing — a bad rootMargin, a hydration failure, a CSS
   * class rename, a build that drops the effect — the site renders a fully
   * blank page to a real visitor while `toBeVisible()`, `toHaveText()` and
   * every other assertion in this suite still passes.
   *
   * Only a computed-opacity check closes that hole. Replacing this with
   * `toBeVisible()` restores the blind spot exactly.
   */
  test('every section ends up with a revealed element at opacity > 0', async ({ page }) => {
    // Five sections, each polled through a 0.55s transition plus its stagger,
    // on a throttled mobile profile — the default 30s budget is uncomfortably
    // close. This is a timeout bump, not a weakened assertion.
    test.setTimeout(90_000);

    await page.goto('/');

    /**
     * Precondition: the mechanism is armed. A reveal this far below the fold
     * must start hidden. Without this check, a build where `.reveal` never
     * made it into the stylesheet at all — Tailwind purges `@layer components`
     * rules whose class name its extractor cannot find, which has already
     * happened once — would leave every element at opacity 1 and pass the
     * assertions below while the animation was entirely gone.
     */
    const beforeScroll = await revealOpacities(page, '#contact');
    expect(beforeScroll.length).toBeGreaterThan(0);
    expect(Math.max(...beforeScroll)).toBe(0);

    for (const selector of SECTIONS) {
      // `scrollIntoViewIfNeeded` is not enough: these sections are taller than
      // the viewport, so once the previous one has been scrolled to, the next
      // one's top edge already counts as "visible" and no scroll happens —
      // leaving its reveals below the fold. Force the section to the top.
      await page
        .locator(selector)
        .first()
        .evaluate((el) => { el.scrollIntoView({ block: 'start' }); });

      await expect
        .poll(async () => Math.max(...(await revealOpacities(page, selector)), -1), {
          message: `no element inside ${selector} reached opacity > 0 — the page renders blank here`,
          timeout: 5_000,
        })
        .toBeGreaterThan(0);
    }
  });

  /**
   * B3: a visitor who asks for reduced motion gets the content immediately,
   * with no scrolling and no transition. `#contact` sits far below the fold and
   * is never scrolled into view here, so a reveal still waiting on the observer
   * would be caught. The `reveal-in` assertion proves the effect's
   * reduced-motion branch ran, not just the CSS media-query guard.
   */
  test('reduced motion renders reveals immediately, without scrolling', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await expect(page.locator('#contact .reveal').first()).toHaveClass(/reveal-in/);

    const opacities = await revealOpacities(page, '#contact');
    expect(opacities.length).toBeGreaterThan(0);
    expect(Math.min(...opacities)).toBe(1);
  });
});

/**
 * Headers declared in netlify.toml are applied by Netlify, not by `next start`,
 * so there is nothing here a local run can honestly assert. These are skipped
 * unless the suite is pointed at a real deploy:
 *
 *   PLAYWRIGHT_BASE_URL=https://<preview>.netlify.app npm run test:e2e
 *
 * Skipping is the honest option. Asserting against `next start` would either
 * fail permanently or, worse, be softened until it passed against a server that
 * never sends these headers at all.
 */
test.describe('deployed security and cache headers', () => {
  test.skip(
    !process.env.PLAYWRIGHT_BASE_URL,
    'netlify.toml headers are applied by Netlify — set PLAYWRIGHT_BASE_URL to a deploy to run these',
  );

  test('security headers are present', async ({ request }) => {
    const response = await request.get('/ar');
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  test('static assets are immutably cached', async ({ request }) => {
    const response = await request.get('/ar');
    const body = await response.text();
    const asset = body.match(/\/_next\/static\/[^"']+\.js/)?.[0];
    if (!asset) throw new Error('no /_next/static asset referenced in the page HTML');
    const assetResponse = await request.get(asset);
    expect(assetResponse.headers()['cache-control']).toContain('immutable');
  });

  /**
   * A CSP that blocks the theme script is invisible to the assertions above:
   * the header is present and correct-looking, and the only symptom is a flash
   * of the wrong theme. The no-flash script sets `color-scheme` on <html>, so
   * checking that it ran is the cheapest proof the policy did not block it.
   */
  test('the no-flash script is not blocked by the CSP', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text())) violations.push(message.text());
    });
    await page.goto('/ar');
    const colorScheme = await page.evaluate(() => document.documentElement.style.colorScheme);
    expect(colorScheme).toMatch(/^(dark|light)$/);
    expect(violations).toEqual([]);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  /**
   * Opacity as the reader experiences it: an element at `opacity: 1` inside a
   * `.reveal` ancestor still at 0 is invisible, and checking the element alone
   * would call that a pass. Multiplies the chain up to <html>.
   */
  async function effectiveOpacity(
    page: import('@playwright/test').Page,
    selector: string,
  ): Promise<number> {
    return page.evaluate((sel) => {
      let node = document.querySelector(sel);
      let opacity = 1;
      while (node) {
        opacity *= Number.parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      return opacity;
    }, selector);
  }

  /**
   * Every reveal on the page starts at `opacity: 0` and is raised by an
   * IntersectionObserver. With scripting off that observer never runs, so
   * without the `<noscript>` override in the locale layout the whole page
   * renders blank — the markup is all there, the reader just cannot see any of
   * it, and so does any crawler that does not execute JS.
   *
   * Content, not chrome: the hero headline is the LCP element and the project
   * cards are the reason a client is on the page at all.
   */
  test('the hero headline and the project cards are visible', async ({ page }) => {
    await page.goto('/ar');

    await expect(page.locator('h1')).toHaveCount(1);
    expect(await effectiveOpacity(page, 'h1')).toBeGreaterThan(0);

    const cards = page.locator('#projects article');
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(cards.first()).toBeVisible();
    expect(await effectiveOpacity(page, '#projects article')).toBeGreaterThan(0);
  });
});

test.describe('per-locale font loading', () => {
  /**
   * Every woff2 the browser actually fetches while loading a locale.
   *
   * Each locale gets a fresh context: sharing one across two navigations lets
   * the first locale's faces stay resident in the font cache, and the second
   * page then reports them as its own.
   */
  async function fontsFetchedOn(
    browser: import('@playwright/test').Browser,
    path: string,
  ): Promise<{ fonts: Set<string>; preloads: number }> {
    const context = await browser.newContext();
    const page = await context.newPage();
    const fonts = new Set<string>();
    page.on('request', (r) => {
      const url = r.url();
      if (url.includes('/_next/static/media/') && url.endsWith('.woff2')) {
        const file = url.split('/').pop();
        if (file) fonts.add(file);
      }
    });
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    const preloads = await page.locator('link[rel="preload"][as="font"]').count();
    await context.close();
    return { fonts, preloads };
  }

  /**
   * The real invariant: the two font sets must not overlap. Counting files is
   * the wrong assertion — Google splits Tajawal into 3 weights x 2 unicode
   * ranges (arabic + latin), so an Arabic page legitimately fetches six faces
   * while still never touching Playfair or Inter.
   */
  test('Arabic never downloads a latin-locale face, and preloads nothing', async ({
    browser,
  }) => {
    const latin = await fontsFetchedOn(browser, '/en');
    const arabic = await fontsFetchedOn(browser, '/ar');

    expect(arabic.fonts.size).toBeGreaterThan(0);
    expect(latin.fonts.size).toBeGreaterThan(0);
    expect([...arabic.fonts].filter((f) => latin.fonts.has(f))).toEqual([]);
    expect(arabic.preloads).toBe(0);
  });

  test('English does not download the Arabic face', async ({ browser }) => {
    const arabic = await fontsFetchedOn(browser, '/ar');
    const latin = await fontsFetchedOn(browser, '/en');

    expect([...latin.fonts].filter((f) => arabic.fonts.has(f))).toEqual([]);
    expect(latin.preloads).toBeLessThanOrEqual(2);
  });

  /**
   * Byte savings mean nothing if a locale silently renders in the initial
   * serif — which is exactly what happens if a font-family stack references a
   * variable the active locale does not define.
   */
  for (const [locale, heading, body] of [
    ['ar', /Tajawal/, /Tajawal/],
    ['en', /Playfair Display/, /Inter/],
    ['fr', /Playfair Display/, /Inter/],
  ] as const) {
    test(`/${locale} renders its intended typeface`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await page.evaluate(() => document.fonts.ready);
      const families = await page.evaluate(() => {
        const heading = document.querySelector('h1');
        if (!heading) throw new Error('no h1 on the page');
        return {
          h1: getComputedStyle(heading).fontFamily,
          body: getComputedStyle(document.body).fontFamily,
        };
      });
      expect(families.h1).toMatch(heading);
      expect(families.body).toMatch(body);
    });
  }
});

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
    .map((dict) => dict.theme.toggle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})$`,
  'i',
);

/** Exact-match matcher for one localized label. */
function label(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

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
  test('every section ends up with a revealed element at opacity > 0', async ({
    page,
  }) => {
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
        .evaluate((el) => {
          el.scrollIntoView({ block: 'start' });
        });

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
  test('reduced motion renders reveals immediately, without scrolling', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await expect(page.locator('#contact .reveal').first()).toHaveClass(/reveal-in/);

    const opacities = await revealOpacities(page, '#contact');
    expect(opacities.length).toBeGreaterThan(0);
    expect(Math.min(...opacities)).toBe(1);
  });
});

/**
 * The bug register from the design spec, §2. Each of these failed before Task
 * 14 and is named after the entry it closes, so a future regression points
 * straight back at the original report.
 */
test.describe('bug register', () => {
  test('B1: resizing past the lg breakpoint with the drawer open restores scrolling', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ar');
    await page.getByRole('button', { name: /menu/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });

    // The drawer is hidden by `lg:hidden` at this width, so a stranded
    // `overflow: hidden` would lock the page with nothing on screen to explain
    // why — the visitor simply cannot scroll.
    await expect
      .poll(async () => page.evaluate(() => document.body.style.overflow))
      .not.toBe('hidden');
  });

  test('B2: the marquee scrolls right-to-left in Arabic', async ({ page }) => {
    await page.goto('/ar');
    const name = await page
      .locator('[data-marquee-track]')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toContain('marquee-rtl');
  });

  test('B2: the marquee scrolls left-to-right in English', async ({ page }) => {
    await page.goto('/en');
    const name = await page
      .locator('[data-marquee-track]')
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toMatch(/^marquee/);
    expect(name).not.toContain('marquee-rtl');
  });

  test('B4: the theme toggle icon matches the stored theme on first paint', async ({
    page,
    context,
  }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem('bc-theme', 'light');
      } catch {}
    });
    const hydrationErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydrat/i.test(message.text())) {
        hydrationErrors.push(message.text());
      }
    });

    await page.goto('/ar');

    // Stored theme is light, so the moon (the move to dark) must be the icon on
    // screen from the first paint. Both icons are in the DOM and CSS picks one,
    // so this is a real check of what the visitor sees.
    await expect(page.locator('button[aria-label] svg.dark\\:hidden')).toBeVisible();
    await expect(page.locator('button[aria-label] svg.dark\\:block')).toBeHidden();

    // And it must arrive without a hydration mismatch. Deriving the icon from
    // React state — in either direction — produced React error #418 here,
    // which makes React discard the server HTML and re-render the whole tree.
    expect(hydrationErrors).toEqual([]);
  });

  test('B7: the mobile drawer traps focus and closes on Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ar');
    await page.getByRole('button', { name: /menu/i }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // Focus must be inside the drawer, not left behind on the page underneath.
    await expect
      .poll(async () =>
        page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null),
      )
      .toBe(true);

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('B8: the language menu is keyboard navigable and returns focus', async ({
    page,
  }) => {
    await page.goto('/en');
    const trigger = page.getByRole('button', {
      name: label(dictionaries.en.language.switch),
    });
    await trigger.click();
    await expect(page.getByRole('menu')).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await expect
      .poll(async () => page.evaluate(() => document.activeElement?.getAttribute('role')))
      .toBe('menuitemradio');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    // Focus back on the trigger, or a keyboard visitor is dumped at the top of
    // the document with no idea where they are.
    await expect(trigger).toBeFocused();
  });

  test('B9: a field error clears once the field is corrected', async ({ page }) => {
    await page.goto('/en');
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await page
      .getByRole('button', { name: label(dictionaries.en.contact.form.send) })
      .click();
    await expect(page.locator('#name-error')).toBeVisible();
    await page.locator('#name').fill('Bay Cheikh');
    await expect(page.locator('#name-error')).toBeHidden();
  });

  test('B10: only the header logo is preloaded', async ({ page }) => {
    await page.goto('/ar');
    // The footer copy is offscreen at load; preloading it competes with the LCP
    // image for early bandwidth.
    const preloads = await page.locator('link[rel="preload"][as="image"]').count();
    expect(preloads).toBeLessThanOrEqual(1);
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
      // Two locations by design: latin faces come from next/font under
      // /_next/static/media, Arabic is self-hosted under /fonts (see the
      // Tajawal block in globals.css for why). Counting only one of them would
      // have made this test pass on a page that fetched no fonts at all.
      const isFont =
        url.endsWith('.woff2') &&
        (url.includes('/_next/static/media/') || url.includes('/fonts/'));
      if (isFont) {
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
  test('Arabic never downloads a latin-locale face', async ({ browser }) => {
    const latin = await fontsFetchedOn(browser, '/en');
    const arabic = await fontsFetchedOn(browser, '/ar');

    expect(arabic.fonts.size).toBeGreaterThan(0);
    expect(latin.fonts.size).toBeGreaterThan(0);
    expect([...arabic.fonts].filter((f) => latin.fonts.has(f))).toEqual([]);
  });

  /**
   * Exactly one preload on Arabic, none on latin.
   *
   * Plan 1 asserted zero everywhere. That changed deliberately in plan 2 task
   * 2: the single Arabic hero face is preloaded because it decides whether the
   * LCP element reflows, and the other five faces stay discovered through CSS
   * so the font-byte win survives. Asserting the exact count keeps both halves
   * honest — a regression to preloading everything fails here just as loudly
   * as a regression to preloading nothing.
   */
  test('Arabic preloads exactly the hero face, and latin preloads nothing', async ({
    browser,
  }) => {
    const arabic = await fontsFetchedOn(browser, '/ar');
    const latin = await fontsFetchedOn(browser, '/en');

    expect(arabic.preloads).toBe(1);
    expect(latin.preloads).toBe(0);
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

declare global {
  interface Window {
    __cls?: number;
  }
}

/**
 * PROTECTED TESTS — do not weaken, skip, or delete.
 *
 * /ar shipped CLS 0.059 to a real deploy while local measurement said 0.0000.
 * Local could not have caught it: a localhost font arrives before anything has
 * painted, so there is no swap to observe. These tests delay the font response
 * by 1.2s, which is what makes a local run representative of a real network.
 *
 * A version of this that does not throttle is not a weaker test — it is a test
 * that cannot fail, which is worse than having none.
 */
test.describe('font swap layout stability', () => {
  for (const locale of ['ar', 'en'] as const) {
    test(`${locale} does not shift when its webfont swaps in`, async ({ page }) => {
      await page.route('**/_next/static/media/*.woff2', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        await route.continue();
      });
      await page.route('**/fonts/*.woff2', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        await route.continue();
      });

      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            };
            if (!shift.hadRecentInput) window.__cls = (window.__cls ?? 0) + shift.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });

      await page.goto(`/${locale}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);

      const cls = await page.evaluate(() => window.__cls ?? 0);
      expect(cls, `${locale} shifted by ${cls} when its font loaded`).toBeLessThan(0.05);
    });
  }
});

/**
 * PROTECTED TESTS — do not weaken, skip, or delete.
 *
 * The admin is a second root layout in its own route group specifically so its
 * client code never lands on the public critical path. Nothing enforces that
 * but this test: a single shared `'use client'` module — one primitive, one
 * toast helper — is enough for Turbopack to hoist admin code into a chunk the
 * public page already loads, and the only symptom would be a bundle number
 * nobody re-measures.
 *
 * The plan proposed `expect(await page.content()).not.toContain('/admin')`.
 * That is not this test and it is not equivalent: `page.content()` is the
 * hydrated DOM, the substring matches any URL that merely contains "/admin",
 * and it says nothing at all about what is inside the chunks. It would pass on
 * a build that shipped the entire dashboard to every visitor. So the assertion
 * reads the delivered JavaScript instead.
 */
test.describe('admin bundle isolation', () => {
  /**
   * Strings that exist only in admin client components. Deliberately UI copy
   * rather than identifiers: a minifier renames identifiers and leaves string
   * literals alone, so these survive a production build.
   */
  const ADMIN_ONLY_MARKERS = [
    'Discard unsaved changes?',
    'Filter pills and lightbox layout.',
    'Card cover only. Not the category.',
    'No projects yet',
  ] as const;

  for (const locale of ['ar', 'en'] as const) {
    test(`/${locale} loads no JavaScript containing admin code`, async ({ page }) => {
      await page.goto(`/${locale}`);

      const sources = await page.evaluate(() =>
        [...document.querySelectorAll('script[src]')].map(
          (s) => s.getAttribute('src') ?? '',
        ),
      );
      // A public page with no scripts would pass every assertion below while
      // proving nothing, so establish that there is something to inspect.
      expect(sources.length, 'no scripts on the page to inspect').toBeGreaterThan(0);

      for (const src of sources) {
        const body = await (await page.request.get(src)).text();
        for (const marker of ADMIN_ONLY_MARKERS) {
          // Asserted on the boolean, not on `body`, so a failure reports the
          // chunk name and the marker instead of printing the whole bundle.
          expect(body.includes(marker), `${src} carries admin code: ${marker}`).toBe(
            false,
          );
        }
      }
    });
  }

  test('the public pages never link to the admin', async ({ page }) => {
    for (const locale of ['ar', 'en', 'fr'] as const) {
      await page.goto(`/${locale}`);
      await expect(page.locator('a[href^="/admin"], a[href*="/admin/"]')).toHaveCount(0);
    }
  });
});

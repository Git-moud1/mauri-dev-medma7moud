# Mauri-Dev v2 — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the portfolio onto Next.js 16 / React 19 with real localized routes, get first-load JS and fonts inside budget, and close the 19-item bug register — leaving a hardened base for the admin panel.

**Architecture:** The keystone is replacing client-side React-context i18n with three statically prerendered routes (`/ar`, `/en`, `/fr`) under a `[locale]` segment, with `proxy.ts` redirecting `/` to the visitor's best match. That single change lets the page render as server components with small client islands, lets the server pick one font family per locale instead of shipping three, and makes per-locale metadata server-rendered. Perf and hardening then build on that base.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5 strict, Tailwind CSS 3, `motion` (framer-motion's React 19 successor), sharp, Playwright, Netlify.

**Scope:** Spec steps 0–4 only. Covers spec §2 (bugs B1–B19), §3.1–3.4, §5, and the step 0–4 rows of §4. **Does not** cover the admin panel (spec §3.5–3.7), SEO metadata/OG/JSON-LD (§4 step 6), the Prism Stack hero (§3.8), or the contact rework (§3.9). Those are plans 2 and 3.

**Source spec:** `docs/superpowers/specs/2026-07-27-mauri-dev-v2-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node baseline:** 20.9+. Local dev is on v24.16.0.
- **Every task ends green:** `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass with **no errors and no warnings**. No `@ts-ignore`. No `any`.
- **`main` is never broken.** All work lands on `feat/v2`.
- **Canonical origin lives in exactly one place:** `NEXT_PUBLIC_SITE_URL`, read once into a single exported constant in `src/lib/site.ts`. No hardcoded origin anywhere else. Current value: `https://medmoudsite.netlify.app`.
- **Three defaults must agree:** dark theme, Arabic locale, RTL direction. After Task 9 the runtime agreement narrows to theme only (`no-flash.tsx` ↔ `ThemeProvider`); `DEFAULT_LOCALE` remains the proxy's fallback.
- **The three dictionaries stay structurally identical.** `src/i18n/dictionaries/en.ts` is the type source of truth via `export type Dictionary = typeof en`. A key removed from one must be removed from all three or the build fails.
- **`src/data/blur.generated.ts` is generated.** Never hand-edit it. Regenerate with `npm run gen:blur`.
- **`sharp` stays in `dependencies`,** not `devDependencies` — Netlify's `prebuild` runs `gen:blur`.
- **`public/__forms.html` field names must mirror `ContactForm.tsx` exactly:** `name`, `email`, `subject`, `message`, plus `form-name` and the `bot-field` honeypot.
- **Never delete or rewrite an entry in `src/data/projects.ts`** — titles, descriptions, or per-locale copy — without asking the owner first.
- **`category` and `frame` stay distinct.** `category` (`web`|`app`) drives the filter and lightbox layout; `frame` (`phone`|`browser`) drives only the card cover.
- **Commit style:** conventional commits, one focused commit per task step where indicated.
- **PROTECTED TESTS — no task may weaken or remove these.** Each exists because a real regression slipped past a weaker check:
  - _Computed `font-family` per locale_ (`tests/smoke.spec.ts`). Added in Task 9 after an undefined `var()` collapsed the whole font declaration and every latin locale silently rendered in Times New Roman — while fetching **zero** fonts, which looked like a byte-budget win. A byte measurement must never again be able to hide a typography failure.
  - _Computed `opacity > 0` on at least one reveal per section._ Playwright treats `opacity: 0` as "visible", so a page whose scroll reveals never fire renders blank and still passes every visibility assertion. Added in Task 10b.
- **Do not chase the 150 KB JS target by removing motion from the remaining islands.** Owner decision: that trades the site's feel for a number set before there was data. Report the real figure. The final target is set in plan 3, after the Prism Stack hero lands and changes the calculation.
- **Import `m` from `motion/react-m`, never from `motion/react`.** The `motion/react` barrel also exports the full `motion` proxy, so `import { m } from 'motion/react'` keeps every feature and _increases_ bundle size — measured at +2.4 KB versus doing nothing at all. Only `import * as m from 'motion/react-m'` actually tree-shakes.

---

## File Structure

**Created:**

| Path                                 | Responsibility                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `src/proxy.ts`                       | Redirect `/` to best-match locale; reserve `/admin/*` guard hook for plan 2             |
| `src/i18n/locale.ts`                 | Locale parsing, `Accept-Language` negotiation, cookie name — pure functions, no React   |
| `src/app/(site)/[locale]/layout.tsx` | Root layout for the public site: `<html lang dir>`, per-locale fonts, metadata          |
| `src/app/(site)/[locale]/page.tsx`   | Server component composing all sections                                                 |
| `src/app/(site)/[locale]/fonts.ts`   | Per-locale font selection                                                               |
| `src/components/Reveal.tsx`          | _(rewritten)_ CSS + IntersectionObserver scroll reveal, no animation library            |
| `src/components/site/*.tsx`          | Server-rendered sections (About, Process, TechMarquee, Footer, Hero shell)              |
| `src/components/islands/*.tsx`       | Client islands (LanguageSwitcher, ThemeToggle, MobileDrawer, ProjectsGrid, ContactForm) |
| `tests/smoke.spec.ts`                | Playwright smoke suite                                                                  |
| `playwright.config.ts`               | Playwright config                                                                       |
| `eslint.config.mjs`                  | Flat ESLint config                                                                      |
| `.prettierrc.json`                   | Prettier config                                                                         |

**Deleted:**

| Path                              | Why                                                               |
| --------------------------------- | ----------------------------------------------------------------- |
| `src/app/layout.tsx`              | Replaced by the `(site)/[locale]` root layout                     |
| `src/app/page.tsx`                | Replaced by `(site)/[locale]/page.tsx`                            |
| `src/app/providers.tsx`           | ThemeProvider moves to an island; I18nProvider becomes server-fed |
| `src/components/DocumentMeta.tsx` | Metadata is server-rendered per locale (closes B13's client half) |
| `.eslintrc.json`                  | Replaced by flat config                                           |

**Heavily modified:** `next.config.mjs`, `netlify.toml`, `tsconfig.json`, `package.json`, `src/i18n/config.ts`, `src/i18n/I18nProvider.tsx`, `src/app/no-flash.tsx`, `src/theme/ThemeProvider.tsx`, `src/lib/site.ts`, `src/app/globals.css`, `tailwind.config.ts`, and every component in `src/components/`.

---

## Task 0: Branch and baseline capture

**Files:**

- Create: `docs/superpowers/baseline/2026-07-27.md`
- Modify: none

**Interfaces:**

- Consumes: nothing
- Produces: `docs/superpowers/baseline/2026-07-27.md` — the before-numbers that `MIGRATION.md` compares against in plan 3.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/v2
git status --short
```

Expected: `M README.md`, `M src/app/layout.tsx` still present (the uncommitted domain fix).

- [ ] **Step 2: Commit the pending domain fix and the lockfile**

The `SITE_URL` change to `medmoudsite.netlify.app` is already made but uncommitted. Commit it now so the dependency diff in Task 2 is reviewable in isolation.

```bash
git add package-lock.json src/app/layout.tsx README.md
git commit -m "chore: commit lockfile and canonical domain fix before upgrade"
```

- [ ] **Step 3: Capture the current bundle baseline**

```bash
curl -s https://medmoudsite.netlify.app/ -o /tmp/baseline.html -w "%{size_download}\n"
grep -o '/_next/static/chunks/[^"]*\.js' /tmp/baseline.html | sort -u
grep -o '/_next/static/media/[^"]*\.woff2' /tmp/baseline.html | sort -u
```

Record every URL's transferred size. Reference values already measured on 2026-07-27:

| Asset                          | Transferred          |
| ------------------------------ | -------------------- |
| HTML                           | 84.8 KB uncompressed |
| JS total (9 chunks)            | ~183 KB              |
| Fonts (5 woff2, all preloaded) | 113.7 KB             |

- [ ] **Step 4: Capture baseline Lighthouse mobile**

```bash
npx lighthouse https://medmoudsite.netlify.app/ \
  --preset=perf --form-factor=mobile --screenEmulation.mobile \
  --throttling-method=simulate --output=json --output=html \
  --output-path=./docs/superpowers/baseline/lighthouse-before
```

Record Performance, Accessibility, Best Practices, SEO, and LCP / CLS / TBT.

- [ ] **Step 5: Write the baseline document**

Create `docs/superpowers/baseline/2026-07-27.md` containing the two tables above plus the Lighthouse scores. This file is read verbatim into `MIGRATION.md` later.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/baseline/
git commit -m "docs: capture pre-upgrade performance baseline"
```

---

## Task 1: Playwright smoke harness

Establishes the safety net **before** the upgrade, so Tasks 2–15 have a real regression signal. Written against the current Next 14 single-route site; extended for localized routes in Task 7.

**Files:**

- Create: `playwright.config.ts`, `tests/smoke.spec.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**

- Consumes: nothing
- Produces: `npm run test:e2e` — the verification command every later task runs.

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write the config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
```

- [ ] **Step 3: Write the failing smoke test**

Create `tests/smoke.spec.ts`. These assertions must hold both before and after the restructure, so they target behaviour, not URLs:

```ts
import { test, expect } from '@playwright/test';

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
  await page.getByRole('button', { name: /switch to (light|dark) mode/i }).click();
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
```

- [ ] **Step 4: Wire the script and ignore artifacts**

In `package.json` `scripts`, add:

```json
"test:e2e": "playwright test"
```

Append to `.gitignore`:

```
/test-results/
/playwright-report/
/blob-report/
```

- [ ] **Step 5: Run the suite against the current site**

Run: `npm run test:e2e`
Expected: **all 5 tests pass on both projects (10 total).** They describe the site as it exists today.

If any fail, that failure is a pre-existing bug — record it and check whether it is already in the B-register before changing the test.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/ package.json package-lock.json .gitignore
git commit -m "test: add Playwright smoke harness as upgrade safety net"
```

---

## Task 2: Next.js 16 + React 19 upgrade

**Files:**

- Modify: `package.json`, `package-lock.json`, `tsconfig.json`

**Interfaces:**

- Consumes: Task 1's `npm run test:e2e`
- Produces: a Next 16 / React 19 toolchain. `next.config.mjs` is corrected in Task 3, not here.

- [ ] **Step 1: Run the official codemod**

```bash
npx @next/codemod@canary upgrade latest
```

Accept the React 19 upgrade when prompted. Review the resulting diff before proceeding — the codemod edits source files.

- [ ] **Step 2: Verify the dependency set moved together**

```bash
node -p "const p=require('./package.json'); JSON.stringify({...p.dependencies,...p.devDependencies},null,2)"
```

Expected: `next` ≥ 16, `react` and `react-dom` ≥ 19, `@types/react` and `@types/react-dom` ≥ 19. React and its types must be upgraded as a set — a mismatched `@types/react` produces hundreds of spurious errors.

Confirm `sharp` is still under `dependencies`, not `devDependencies`.

- [ ] **Step 3: Run the type checker to surface async-API breakage**

Run: `npx tsc --noEmit`
Expected at this point: **may fail.** Next 16 fully removes synchronous access to `params`, `searchParams`, `cookies()`, `headers()`, and `draftMode()`. The current codebase reads none of them (the single page takes no props), so this most likely passes — but if the codemod introduced a `PageProps` signature, fix it to the async form:

```tsx
export default async function Page(props: PageProps<'/[locale]'>) {
  const { locale } = await props.params;
  // …
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS. Turbopack is now the only bundler. `next.config.mjs` currently contains **no** custom webpack config, so there is nothing to port — confirm by reading the file.

- [ ] **Step 5: Run the smoke suite**

Run: `npm run test:e2e`
Expected: all 10 pass.

If the console-errors test now fails, the messages are almost certainly React 19 hydration warnings. Do not suppress them — record which component each points at and confirm it is already covered by B4 (ThemeProvider initial state) or B6 (Footer year). Both are fixed in Task 14.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/
git commit -m "feat: upgrade to Next.js 16 and React 19"
```

---

## Task 3: next.config, proxy convention, and image qualities

**Files:**

- Modify: `next.config.mjs`
- Create: `src/proxy.ts` (stub; locale logic lands in Task 6)

**Interfaces:**

- Consumes: Task 2's Next 16 toolchain
- Produces: `next.config.mjs` with `images.qualities` declared and `dangerouslyAllowSVG` removed; `src/proxy.ts` exporting `proxy(request: NextRequest)`.

- [ ] **Step 1: Confirm no SVGs are served through next/image**

```bash
find public -iname '*.svg'
grep -rn '\.svg' src/data/projects.ts src/components/ || echo "no svg references"
```

Expected: **no output from either.** `public/projects/**` is entirely jpg/jpeg/png/webp. This is the precondition for removing `dangerouslyAllowSVG` (B15). If any SVG appears, stop and report — do not remove the flag.

- [ ] **Step 2: Rewrite next.config.mjs**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Next 16 defaults images.qualities to [75] and returns 400 for a direct
    // API request with an unlisted quality. The project renders cards at 70,
    // the lightbox stage at 78, and thumbnails at 55.
    qualities: [55, 70, 75, 78],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
```

`dangerouslyAllowSVG`, `contentDispositionType`, and `contentSecurityPolicy` are all removed — they existed only to fence the SVG allowance (B15).

- [ ] **Step 3: Create the proxy stub**

Create `src/proxy.ts`. Next 16 renamed `middleware.ts` to `proxy.ts` and the named export `middleware` to `proxy`. **The `edge` runtime is not supported in proxy and cannot be configured — proxy always runs on Node.js.**

```ts
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
```

- [ ] **Step 4: Verify image quality coercion did not silently change output**

Run: `npm run build && npm run start` (background), then:

```bash
curl -s http://localhost:3000/ | grep -o 'q=[0-9]*' | sort -u
```

Expected: `q=70` present (cards). If only `q=75` appears, `images.qualities` was not picked up — recheck the config file name and export.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test:e2e`
Expected: all pass.

```bash
git add next.config.mjs src/proxy.ts
git commit -m "feat: declare images.qualities, drop dangerouslyAllowSVG, add proxy stub"
```

---

## Task 4: Migrate framer-motion to motion

**Files:**

- Modify: `package.json`, and every file importing `framer-motion`

**Interfaces:**

- Consumes: Task 2's React 19
- Produces: all motion imports resolve to `motion/react`.

- [ ] **Step 1: Enumerate the import sites**

```bash
grep -rln "from 'framer-motion'" src/
```

Expected: `Reveal.tsx`, `Header.tsx`, `Hero.tsx`, `Projects.tsx`, `ProjectGallery.tsx`, `ContactForm.tsx`, `WhatsApp.tsx`, `LanguageSwitcher.tsx`, `ThemeToggle.tsx`.

- [ ] **Step 2: Swap the dependency**

```bash
npm uninstall framer-motion
npm install motion
```

- [ ] **Step 3: Rewrite every import**

`framer-motion` → `motion/react`. The runtime API is unchanged; only the package and entry point move.

```ts
// before
import { motion, AnimatePresence, type Variants, type PanInfo } from 'framer-motion';
// after
import { motion, AnimatePresence, type Variants, type PanInfo } from 'motion/react';
```

Apply to all nine files. Verify none remain:

```bash
grep -rn "framer-motion" src/ && echo "STILL PRESENT" || echo "clean"
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test:e2e`
Expected: all pass. The lightbox test in particular exercises `AnimatePresence`, drag, and spring transitions.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/
git commit -m "refactor: migrate framer-motion to motion for React 19"
```

---

## Task 4b: Make the e2e suite reliable on a cold cache

Added after Task 4 surfaced this. **Must land before anything reaches CI.**

The suite currently passes only on a warm `next/image` optimizer cache. On a cold one, 6 Playwright workers × 2 device projects request ~72 sharp-optimized images simultaneously; the optimizer returns 500s under that load and `page.waitForLoadState('networkidle')` times out at 30 s. A CI runner is cold by definition, so the gate would fail on its first run every time.

**A suite that only passes on a warm cache is not a real gate.** Fix the harness, not the assertions.

**Files:**

- Create: `tests/global-setup.ts`
- Modify: `playwright.config.ts`

**Interfaces:**

- Consumes: Task 1's harness
- Produces: a suite that passes from a cold `.next` on the first run.

- [ ] **Step 1: Reproduce the failure**

```bash
rm -rf .next
npm run test:e2e
```

Expected: at least one failure, most likely `networkidle` timing out, possibly accompanied by 500s from `/_next/image`. Capture the actual output — if it passes cold, the diagnosis has changed and the rest of this task needs rethinking rather than applying blind.

- [ ] **Step 2: Cap worker concurrency**

In `playwright.config.ts`, add:

```ts
// The next/image optimizer is CPU-bound on sharp. Unbounded workers stampede
// it on a cold cache and it starts returning 500s. Two workers keeps the
// suite honest without serialising it entirely.
workers: process.env.CI ? 2 : 4,
```

- [ ] **Step 3: Warm the image cache in globalSetup**

Create `tests/global-setup.ts`:

```ts
import { chromium, type FullConfig } from '@playwright/test';

/**
 * Warms the next/image optimizer cache before the suite runs.
 *
 * sharp re-encodes every image on first request. Without this, the first test
 * to load the page races every other worker for optimizer capacity and the
 * page never reaches networkidle inside its timeout.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(baseURL, { waitUntil: 'load' });
  // Scroll the full page so lazy-loaded project images are requested too.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let y = 0;
      const step = () => {
        y += window.innerHeight;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 100);
        else resolve();
      };
      step();
    });
  });
  await page.waitForLoadState('networkidle').catch(() => {
    // Best-effort warm-up: a timeout here is not a test failure.
  });
  await browser.close();
}
```

Register it in `playwright.config.ts`:

```ts
globalSetup: './tests/global-setup.ts',
```

- [ ] **Step 4: Verify cold**

```bash
rm -rf .next
npm run test:e2e
```

Expected: **all tests pass on a cold cache, first run.** Repeat twice to confirm it is not flaky. If it still fails, do not raise the `networkidle` timeout to paper over it — report instead, because that would hide a real optimizer capacity problem rather than fix it.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`

```bash
git add playwright.config.ts tests/global-setup.ts
git commit -m "test: make e2e suite pass on a cold next/image cache (task 4b)"
```

---

## Task 5: Locale primitives

Pure, testable locale logic with no React and no Next imports — so the proxy, the layout, and the tests can all share it.

**Files:**

- Create: `src/i18n/locale.ts`, `tests/locale.spec.ts`
- Modify: `src/i18n/config.ts`

**Interfaces:**

- Consumes: `LOCALES`, `DEFAULT_LOCALE`, `Locale` from `src/i18n/config.ts`
- Produces:
  - `LOCALE_COOKIE: 'bc-locale'`
  - `isLocale(value: unknown): value is Locale`
  - `negotiateLocale(acceptLanguage: string | null): Locale`
  - `dirFor(locale: Locale): 'rtl' | 'ltr'`

- [ ] **Step 1: Write the failing test**

Create `tests/locale.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { isLocale, negotiateLocale, dirFor, LOCALE_COOKIE } from '../src/i18n/locale';

test.describe('locale primitives', () => {
  test('isLocale accepts only the three supported codes', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale('')).toBe(false);
  });

  test('dirFor maps Arabic to rtl and the rest to ltr', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
    expect(dirFor('fr')).toBe('ltr');
  });

  test('negotiateLocale picks the highest-quality supported match', () => {
    expect(negotiateLocale('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(negotiateLocale('en-US,en;q=0.9')).toBe('en');
    expect(negotiateLocale('ar-MR,ar;q=0.9')).toBe('ar');
  });

  test('negotiateLocale respects q-values over source order', () => {
    expect(negotiateLocale('de;q=1.0,en;q=0.9,fr;q=0.95')).toBe('fr');
  });

  test('negotiateLocale falls back to Arabic', () => {
    expect(negotiateLocale(null)).toBe('ar');
    expect(negotiateLocale('')).toBe('ar');
    expect(negotiateLocale('de-DE,de;q=0.9')).toBe('ar');
  });

  test('the cookie name matches the legacy localStorage key', () => {
    expect(LOCALE_COOKIE).toBe('bc-locale');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/locale.spec.ts --project=desktop`
Expected: FAIL — `Cannot find module '../src/i18n/locale'`.

- [ ] **Step 3: Implement**

Create `src/i18n/locale.ts`:

```ts
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, type Locale } from './config';

/**
 * Cookie name for the visitor's chosen locale. Deliberately identical to the
 * legacy localStorage key so the migration shim in no-flash.tsx can move a
 * value across without a second name to keep track of.
 */
export const LOCALE_COOKIE = 'bc-locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return LOCALE_META[locale].dir;
}

/**
 * Parse an Accept-Language header and return the best supported match.
 * Compares on the primary subtag, so "fr-FR" matches "fr". Sorts by q-value
 * descending; entries without an explicit q default to 1.0 per RFC 9110.
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      const primary = tag.trim().toLowerCase().split('-')[0] ?? '';
      return { primary, q: Number.isNaN(q) ? 0 : q };
    })
    .filter((entry) => entry.primary.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const entry of ranked) {
    if (isLocale(entry.primary)) return entry.primary;
  }
  return DEFAULT_LOCALE;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx playwright test tests/locale.spec.ts --project=desktop`
Expected: PASS — 6 tests.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src/i18n/locale.ts tests/locale.spec.ts
git commit -m "feat: add locale negotiation primitives"
```

---

## Task 6: Locale routing — proxy redirect and the [locale] route tree

The structural change. Uses a route group so the admin panel can be added in plan 2 as a second root layout without restructuring.

**Files:**

- Create: `src/app/(site)/[locale]/layout.tsx`, `src/app/(site)/[locale]/page.tsx`
- Modify: `src/proxy.ts`
- Delete: `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**

- Consumes: `isLocale`, `negotiateLocale`, `dirFor`, `LOCALE_COOKIE` from Task 5
- Produces: three statically prerendered routes; `/` 307-redirects. `generateStaticParams()` returns `[{locale:'ar'},{locale:'en'},{locale:'fr'}]`.

- [ ] **Step 1: Write the failing routing test**

Append to `tests/smoke.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm run test:e2e -- --grep "localized routes|root redirects|unsupported locale"`
Expected: FAIL — `/` does not redirect and `/ar` 404s.

- [ ] **Step 3: Implement the proxy redirect**

Replace `src/proxy.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, negotiateLocale, LOCALE_COOKIE } from '@/i18n/locale';

/**
 * Redirects `/` to the visitor's best-match locale. Preference order:
 * the bc-locale cookie, then Accept-Language, then Arabic.
 *
 * Runs on the Node.js runtime — Next 16 does not support the edge runtime in
 * proxy and it cannot be configured. Routing and headers only; no auth logic
 * lives here (plan 2 adds an /admin guard, but every server action still
 * re-verifies its own session).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only the bare root is redirected. Anything already carrying a locale
  // segment — or any other path, which the route tree will 404 — passes through.
  if (pathname !== '/') return NextResponse.next();

  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie)
    ? cookie
    : negotiateLocale(request.headers.get('accept-language'));

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
```

- [ ] **Step 4: Create the locale layout**

**Do step 8 first** — the layout below imports `SITE_URL`, which step 8 creates. (Kept in this order for narrative flow; the dependency runs the other way.)

Create `src/app/(site)/[locale]/layout.tsx`. This becomes the **root layout** — it owns `<html>`. Fonts are wired in Task 9; for now keep all three variables so nothing regresses visually.

```tsx
import type { Metadata, Viewport } from 'next';
import { Playfair_Display, Inter, Tajawal } from 'next/font/google';
import { notFound } from 'next/navigation';
import '../../globals.css';
import { NoFlashScript } from '../../no-flash';
import { LOCALES, type Locale } from '@/i18n/config';
import { isLocale, dirFor } from '@/i18n/locale';
import { dictionaries } from '@/i18n/dictionaries';
import { SITE, SITE_URL } from '@/lib/site';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const dict = dictionaries[locale];

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: dict.meta.title, template: `%s — ${SITE.name}` },
    description: dict.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: { ar: '/ar', en: '/en', fr: '/fr', 'x-default': '/ar' },
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#08080c' },
  ],
};

export default async function LocaleLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;

  return (
    // suppressHydrationWarning covers the theme class written by NoFlashScript.
    // lang and dir are server-rendered per route and never mutated at runtime.
    <html lang={typed} dir={dirFor(typed)} suppressHydrationWarning>
      <head>
        <NoFlashScript />
      </head>
      <body
        className={`${playfair.variable} ${inter.variable} ${tajawal.variable} antialiased`}
      >
        {props.children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Move the page**

Create `src/app/(site)/[locale]/page.tsx`. Keep the existing composition; the server/client split is Task 8.

```tsx
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/locale';
import { Providers } from '@/app/providers';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { TechMarquee } from '@/components/TechMarquee';
import { About } from '@/components/About';
import { Projects } from '@/components/Projects';
import { Process } from '@/components/Process';
import { Contact } from '@/components/Contact';
import { Footer } from '@/components/Footer';
import { FloatingWhatsApp } from '@/components/WhatsApp';

export default async function Home(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  return (
    <Providers locale={locale}>
      <Header />
      <main>
        <Hero />
        <TechMarquee />
        <About />
        <Projects />
        <Process />
        <Contact />
      </main>
      <Footer />
      <FloatingWhatsApp />
    </Providers>
  );
}
```

- [ ] **Step 6: Feed the locale into the provider from the server**

`DocumentMeta` is gone — metadata is server-rendered now. Modify `src/app/providers.tsx` to accept the server-resolved locale:

```tsx
'use client';

import { I18nProvider } from '@/i18n/I18nProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { Locale } from '@/i18n/config';

export function Providers({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <I18nProvider locale={locale}>{children}</I18nProvider>
    </ThemeProvider>
  );
}
```

Modify `src/i18n/I18nProvider.tsx` to take `locale` as a prop instead of hydrating it from storage. **Delete** the `useEffect` that reads `localStorage` and the `ready` flag — the locale is now known at render time on both server and client, which is what removes the content flash (B11). `setLocale` navigates and writes the cookie:

```tsx
'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALE_META, type Locale } from './config';
import { LOCALE_COOKIE } from './locale';
import { dictionaries, type Dictionary } from './dictionaries';

// … PathInto / TKey / resolve / interpolate unchanged …

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const dict = dictionaries[locale];

  const setLocale = useCallback(
    (next: Locale) => {
      // 1 year, lax so the redirect on / can read it.
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
      router.push(`/${next}`);
    },
    [router],
  );

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) =>
      interpolate(resolve(dict, key), vars),
    [dict],
  );

  const value = useMemo(
    () => ({ locale, dir: LOCALE_META[locale].dir, setLocale, t, dict }),
    [locale, setLocale, t, dict],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
```

Remove `ready` from `I18nContextValue`. Update every consumer that destructured it.

- [ ] **Step 7: Delete the superseded files**

```bash
git rm src/app/layout.tsx src/app/page.tsx src/components/DocumentMeta.tsx
```

`DocumentMeta` was the client-side title/description rewriter; `generateMetadata` replaces it (closes half of B13, and B14 via the real `alternates.languages` map).

- [ ] **Step 8: Add SITE_URL to the single-source constant**

In `src/lib/site.ts`, above the `SITE` object:

```ts
/**
 * The one place the canonical origin is defined. metadataBase, canonical URLs,
 * hreflang alternates, OG image URLs, sitemap.ts and robots.ts all derive from
 * this. Switching to a custom domain is a one-line env change.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://medmoudsite.netlify.app';
```

- [ ] **Step 9: Verify the routes prerender statically**

Run: `npm run build`
Expected: the build output lists `/[locale]` as **SSG** with three prerendered paths `/ar`, `/en`, `/fr`. If it shows `ƒ (Dynamic)`, something in the tree is reading request-time data — find it before proceeding, because dynamic rendering forfeits the CDN-HTML goal.

- [ ] **Step 10: Run the full suite**

Run: `npm run test:e2e`
Expected: all pass, including the four new routing tests.

- [ ] **Step 11: Commit**

```bash
git add -A src/ tests/
git commit -m "feat: localized /ar /en /fr routes with proxy locale redirect"
```

---

## Task 7: no-flash rewrite and the one-time locale migration shim

**Files:**

- Modify: `src/app/no-flash.tsx`
- Create: test in `tests/smoke.spec.ts`

**Interfaces:**

- Consumes: `LOCALE_COOKIE` from Task 5
- Produces: a no-flash script that handles **theme only**, plus a one-time `localStorage` → cookie locale migration.

- [ ] **Step 1: Write the failing migration test**

Append to `tests/smoke.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm run test:e2e -- --grep "legacy localStorage locale"`
Expected: FAIL — no cookie is written and `/` redirects to `/ar`.

- [ ] **Step 3: Implement**

Replace `src/app/no-flash.tsx`:

```tsx
/**
 * Inline pre-hydration script. Two jobs:
 *
 * 1. Theme — read `bc-theme` from localStorage (falling back to the OS
 *    preference) and set the dark class + colorScheme before first paint.
 *    Its default must stay in sync with ThemeProvider's initial state.
 *
 * 2. One-time locale migration — v1 stored the locale in localStorage under
 *    `bc-locale`. v2 needs it in a cookie so proxy.ts can read it when
 *    redirecting `/`. This moves any legacy value across and deletes the key.
 *    Idempotent: once the key is gone this branch is a no-op. Scheduled for
 *    removal in a later release (tracked in MIGRATION.md).
 *
 * lang and dir are NOT set here any more — they are server-rendered per route.
 */
export function NoFlashScript() {
  const code = `(function(){try{
    var t=localStorage.getItem('bc-theme');
    if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
    var r=document.documentElement;
    if(t==='dark'){r.classList.add('dark');}
    r.style.colorScheme=t;
    var legacy=localStorage.getItem('bc-locale');
    if(legacy&&['ar','en','fr'].indexOf(legacy)!==-1){
      if(document.cookie.indexOf('bc-locale=')===-1){
        document.cookie='bc-locale='+legacy+';path=/;max-age=31536000;samesite=lax';
      }
      localStorage.removeItem('bc-locale');
    }
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
```

This is the **only** permitted `dangerouslySetInnerHTML` in the codebase. It takes no external input — the string is a compile-time constant.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test:e2e -- --grep "legacy localStorage locale"`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test:e2e`

```bash
git add src/app/no-flash.tsx tests/smoke.spec.ts
git commit -m "feat: migrate legacy localStorage locale to cookie in no-flash script"
```

---

## Task 8: Server components and client islands

Where the JS budget is actually won. Nothing below the providers is a client component unless it needs interactivity or browser APIs.

**Files:**

- Create: `src/components/islands/LanguageSwitcher.tsx`, `src/components/islands/ThemeToggle.tsx`, `src/components/islands/MobileDrawer.tsx`, `src/components/islands/ProjectsGrid.tsx`, `src/components/islands/ContactForm.tsx`, `src/components/islands/FloatingWhatsApp.tsx`
- Modify: `src/components/Header.tsx`, `Hero.tsx`, `About.tsx`, `Process.tsx`, `TechMarquee.tsx`, `Contact.tsx`, `Footer.tsx`, `Projects.tsx`
- Modify: `src/app/(site)/[locale]/page.tsx`

**Interfaces:**

- Consumes: Task 6's server-resolved locale
- Produces: server sections take `{ locale, dict }` props; islands keep using `useI18n()`.

- [ ] **Step 1: Add a server-side translation helper**

Server components cannot call the `useI18n` hook. Create `src/i18n/server.ts`:

```ts
import { dictionaries, type Dictionary } from './dictionaries';
import type { Locale } from './config';

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

function resolve(dict: Dictionary, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict);
  return typeof value === 'string' ? value : key;
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** Server-side counterpart to useI18n().t — same resolution and interpolation. */
export function getT(locale: Locale): TFunction {
  const dict = dictionaries[locale];
  return (key, vars) => interpolate(resolve(dict, key), vars);
}

export function getDict(locale: Locale): Dictionary {
  return dictionaries[locale];
}
```

- [ ] **Step 2: Convert the static sections to server components**

For `About.tsx`, `Process.tsx`, `TechMarquee.tsx`, and `Footer.tsx`: delete the `'use client'` directive, delete `useI18n()`, accept `locale` as a prop, and call `getT(locale)`. Example for `Process.tsx`:

```tsx
import { getT } from '@/i18n/server';
import type { Locale } from '@/i18n/config';
import { Reveal } from './Reveal';

const STEPS = ['s1', 's2', 's3', 's4'] as const;

export function Process({ locale }: { locale: Locale }) {
  const t = getT(locale);
  // … identical JSX, no other change …
}
```

Apply the same shape to `About`, `TechMarquee`, and `Footer`.

- [ ] **Step 3: Split the Header**

`Header.tsx` becomes a server component rendering the static nav; the scroll-state wrapper and drawer move into `src/components/islands/MobileDrawer.tsx` (which also fixes B1 and B7 in Task 14). `LanguageSwitcher` and `ThemeToggle` move under `islands/` unchanged apart from the import path.

- [ ] **Step 4: Split Projects**

`Projects.tsx` becomes a server component rendering the section heading and passing `projects` plus the localized strings down. The filter pills, the animated grid, and the lightbox trigger move into `islands/ProjectsGrid.tsx` (`'use client'`), which keeps the existing `dynamic(() => import('../ProjectGallery'), { ssr: false })`.

- [ ] **Step 5: Update the page composition**

```tsx
export default async function Home(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  return (
    <Providers locale={locale}>
      <Header locale={locale} />
      <main>
        <Hero locale={locale} />
        <TechMarquee locale={locale} />
        <About locale={locale} />
        <Projects locale={locale} />
        <Process locale={locale} />
        <Contact locale={locale} />
      </main>
      <Footer locale={locale} />
      <FloatingWhatsApp locale={locale} />
    </Providers>
  );
}
```

- [ ] **Step 6: Verify the client boundary count**

```bash
grep -rln "'use client'" src/components/ src/i18n/ src/theme/ | sort
```

Expected — exactly these, and nothing else:

```
src/components/ContactForm.tsx  (moved to islands/)
src/components/ProjectGallery.tsx
src/components/Reveal.tsx
src/components/islands/ContactForm.tsx
src/components/islands/FloatingWhatsApp.tsx
src/components/islands/LanguageSwitcher.tsx
src/components/islands/MobileDrawer.tsx
src/components/islands/ProjectsGrid.tsx
src/components/islands/ThemeToggle.tsx
src/i18n/I18nProvider.tsx
src/theme/ThemeProvider.tsx
```

`About.tsx`, `Process.tsx`, `TechMarquee.tsx`, `Footer.tsx`, `Hero.tsx`, `Header.tsx`, `Contact.tsx`, and `Projects.tsx` must **not** appear.

- [ ] **Step 7: Measure the JS delta**

Next 16's Turbopack build does **not** print a "First Load JS" column — use the measurement script instead:

```bash
npm run build
npm run start &
node scripts/measure-bundle.mjs http://localhost:3000/ar
```

Reference points, both gzipped: Next 14 baseline **183 KB**; post-upgrade, pre-split **252.8 KB** (the upgrade itself cost ~70 KB).

Expected: a large drop, since `motion`, the i18n context, and every static section should leave the client bundle entirely. If the number has barely moved, a client boundary is still higher in the tree than intended — recheck `Providers`.

**Report the real figure.** Do not round toward the 150 KB target, and do not treat missing it as a failure to conceal — the owner has explicitly said the target may move once this number is known.

- [ ] **Step 8: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test:e2e`

```bash
git add -A src/
git commit -m "perf: render page as server components with client islands"
```

---

## Task 9: Per-locale fonts

**Files:**

- Create: `src/app/(site)/[locale]/fonts.ts`
- Modify: `src/app/(site)/[locale]/layout.tsx`, `src/app/globals.css`

**Interfaces:**

- Consumes: Task 6's layout
- Produces: `fontClassFor(locale: Locale): string` — the className string for the active locale only.

- [ ] **Step 1: Write the failing preload test**

Append to `tests/smoke.spec.ts`:

```ts
test.describe('per-locale font loading', () => {
  test('Arabic preloads at most one font and never Playfair', async ({ page }) => {
    const fontRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/_next/static/media/') && r.url().endsWith('.woff2')) {
        fontRequests.push(r.url());
      }
    });
    await page.goto('/ar');
    await page.waitForLoadState('networkidle');
    expect(fontRequests.length).toBeLessThanOrEqual(2);
  });

  test('English does not download the Arabic face', async ({ page }) => {
    const preloads = await page.goto('/en').then(async () => {
      return page.locator('link[rel="preload"][as="font"]').count();
    });
    expect(preloads).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm run test:e2e -- --grep "per-locale font"`
Expected: FAIL — 5 preloads / 5 font requests on both routes.

- [ ] **Step 3: Implement**

`next/font` loaders must be called at module scope — they cannot be conditional. So declare all three but apply only the active locale's variables, and set `preload: false` on the families a given locale never renders.

Create `src/app/(site)/[locale]/fonts.ts`:

```ts
import { Playfair_Display, Inter, Tajawal } from 'next/font/google';
import type { Locale } from '@/i18n/config';

// Latin locales: Playfair for display, Inter for body. Only these two preload.
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
});
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
});

// Arabic: Tajawal covers both body and display (Playfair has no Arabic glyphs).
const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-arabic',
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
});

/** The className carrying only the font variables the given locale renders. */
export function fontClassFor(locale: Locale): string {
  return locale === 'ar' ? tajawal.variable : `${playfair.variable} ${inter.variable}`;
}
```

In `layout.tsx`, delete the three inline font declarations and use:

```tsx
import { fontClassFor } from './fonts';
// …
<body className={`${fontClassFor(typed)} antialiased`}>
```

- [ ] **Step 4: Run the test**

Run: `npm run test:e2e -- --grep "per-locale font"`
Expected: PASS.

**If it still fails,** Next is emitting preloads for fonts whose class is not rendered. Fallback: split the two font sets into sibling route groups so each route's module graph contains only its own fonts — `(site)/(rtl)/[locale]` and `(site)/(ltr)/[locale]` — or set `preload: false` on the non-active families and accept an on-demand fetch that never fires because the CSS variable is never referenced. Verify whichever path you take with the same test; do not declare this task done on an assumption.

- [ ] **Step 5: Measure**

```bash
npm run build && npm run start &
curl -s http://localhost:3000/ar | grep -c 'rel="preload".*font'
curl -s http://localhost:3000/en | grep -c 'rel="preload".*font'
```

Expected: ≤ 2 each, down from 5. Record the transferred font bytes per locale for `MIGRATION.md`.

- [ ] **Step 6: Commit**

```bash
git add src/app/ src/app/globals.css
git commit -m "perf: load only the fonts the active locale renders"
```

---

## Task 10: LazyMotion and CSS scroll reveals

**Files:**

- Modify: `src/components/Reveal.tsx`, `src/app/globals.css`, `src/components/islands/*.tsx`

**Interfaces:**

- Consumes: Task 4's `motion/react`
- Produces: `Reveal` with no animation-library dependency; `LazyMotion` wrapping the remaining islands.

- [ ] **Step 1: Rewrite Reveal without the animation library**

Scroll reveals are the single most-used animation and do not need a physics engine. Replace `src/components/Reveal.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Scroll reveal via IntersectionObserver + CSS transition. Animates once.
 * Zero animation-library cost. Honours prefers-reduced-motion by rendering
 * visible immediately (fixes B3 for every reveal on the page).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article' | 'span';
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: '-60px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={`reveal ${visible ? 'reveal-in' : ''} ${className ?? ''}`}
      style={{ transitionDelay: `${delay * 80}ms` }}
    >
      {children}
    </Tag>
  );
}
```

Add to `globals.css` under `@layer components`:

```css
.reveal {
  opacity: 0;
  transform: translateY(28px);
  transition:
    opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}
.reveal-in {
  opacity: 1;
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

- [ ] **Step 2: Wrap the remaining islands in LazyMotion**

In `src/app/providers.tsx`:

```tsx
'use client';

import { LazyMotion, domAnimation } from 'motion/react';
// …
<ThemeProvider>
  <I18nProvider locale={locale}>
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  </I18nProvider>
</ThemeProvider>;
```

`strict` makes any use of the full `motion.*` component a build-time error, forcing the lighter `m.*` form. Rewrite the remaining animated islands to import `m` instead of `motion`:

```tsx
import { m, AnimatePresence } from 'motion/react';
// <motion.div …>  →  <m.div …>
```

**Exception:** `ProjectGallery.tsx` uses drag and gestures, which `domAnimation` does not include. It is already loaded via `dynamic(..., { ssr: false })`, so it keeps the full `motion` import and gets its own `LazyMotion features={domMax}` wrapper inside the lightbox — keeping gesture code out of the initial bundle.

- [ ] **Step 3: Verify the bundle moved**

```bash
npm run build
npm run start &
node scripts/measure-bundle.mjs http://localhost:3000/ar
```

Expected: JS down again from whatever Task 8 measured. The plan's original target is ≤ ~150 KB gzipped, but that target is under review — Task 8 reports the real post-split number and the owner decides then whether the target moves or more gets cut. Report the actual figure either way.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test:e2e`

```bash
git add -A src/
git commit -m "perf: replace reveal animations with CSS and scope motion to LazyMotion"
```

---

## Task 11: Defer below-the-fold work

**Files:**

- Modify: `src/app/(site)/[locale]/page.tsx`, `src/app/globals.css`, `src/components/TechMarquee.tsx`

**Interfaces:**

- Consumes: Task 8's section components
- Produces: below-fold sections skip rendering work until near-viewport.

- [ ] **Step 1: Add content-visibility to below-fold sections**

In `globals.css`:

```css
@layer utilities {
  /* Skip layout/paint for offscreen sections. contain-intrinsic-size keeps the
     scrollbar honest so deferral never causes layout shift. */
  .defer-paint {
    content-visibility: auto;
    contain-intrinsic-size: auto 800px;
  }
}
```

Apply `defer-paint` to the `About`, `Process`, `Contact`, and `Footer` root elements. **Do not** apply it to `Hero` or `Projects` — Hero is the LCP region and Projects sits close enough to the fold that deferring it risks a visible pop.

- [ ] **Step 2: Stop the marquee animating while offscreen**

`TechMarquee` runs an infinite CSS animation that composites continuously even when scrolled away. Gate it on visibility using the same class:

```css
.marquee-track {
  animation-play-state: paused;
}
.defer-paint:has(.marquee-track),
.marquee-visible .marquee-track {
  animation-play-state: running;
}
```

Simpler and more reliable: add `.defer-paint` to the marquee section and rely on `content-visibility: auto`, which already suspends animations in skipped subtrees. Verify with a paused-frame check in DevTools' Performance panel that no compositing work occurs while the marquee is offscreen.

- [ ] **Step 3: Verify no layout shift was introduced**

Run: `npm run build && npm run start`, then Lighthouse against `http://localhost:3000/ar`. CLS must stay < 0.05. If `contain-intrinsic-size` is badly estimated, the scrollbar jumps — tune the value per section rather than removing the deferral.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test:e2e`

```bash
git add -A src/
git commit -m "perf: defer paint for below-the-fold sections"
```

---

## Task 12: Security and caching headers

**Files:**

- Modify: `netlify.toml`

**Interfaces:**

- Consumes: nothing
- Produces: security and cache headers on every response (closes B12).

- [ ] **Step 1: Write the failing header test**

Append to `tests/smoke.spec.ts`:

```ts
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
  expect(asset).toBeTruthy();
  const assetResponse = await request.get(asset!);
  expect(assetResponse.headers()['cache-control']).toContain('immutable');
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npm run test:e2e -- --grep "security headers|immutably cached"`
Expected: FAIL — `netlify.toml` has no `[[headers]]` block at all.

- [ ] **Step 3: Implement**

Append to `netlify.toml`:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Strict-Transport-Security = "max-age=63072000; includeSubDomains; preload"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), interest-cohort=()"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

[[headers]]
  for = "/_next/static/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/projects/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

**Known limitation, recorded deliberately:** `script-src` carries `'unsafe-inline'` because the `no-flash` inline script has no nonce. The spec calls for a nonce-based CSP. A nonce requires request-time rendering, which would forfeit static prerendering and the CDN-HTML goal from Task 6 — the two requirements are in direct tension. **Resolve this by hashing instead:** compute the SHA-256 of the no-flash script body at build time and put `'sha256-…'` in `script-src`, which is compatible with static prerendering. Do that in step 4 rather than shipping `'unsafe-inline'`.

- [ ] **Step 4: Replace unsafe-inline with a script hash**

```bash
node -e "
const {createHash}=require('crypto');
const src=require('fs').readFileSync('src/app/no-flash.tsx','utf8');
const code=src.match(/const code = \`([\s\S]*?)\`;/)[1];
console.log('sha256-'+createHash('sha256').update(code).digest('base64'));
"
```

Put the printed value into `script-src` in place of `'unsafe-inline'`:

```
script-src 'self' 'sha256-<printed value>';
```

**This hash must be recomputed whenever `no-flash.tsx` changes.** Add a comment in `no-flash.tsx` saying so, and note it in `MIGRATION.md`.

- [ ] **Step 5: Verify against a deploy preview**

Headers in `netlify.toml` are applied by Netlify, not by `next start`, so local verification is not sufficient.

```bash
git push -u origin feat/v2
```

Then, against the Netlify deploy preview URL:

```bash
PLAYWRIGHT_BASE_URL=https://<preview>.netlify.app npm run test:e2e -- --grep "security headers|immutably cached"
```

Expected: PASS. Also confirm in the browser console that no CSP violation is reported on `/ar`, `/en`, or `/fr` — a blocked script is silent in the tests but fatal for the theme.

- [ ] **Step 6: Commit**

```bash
git add netlify.toml src/app/no-flash.tsx tests/smoke.spec.ts
git commit -m "feat: add security and immutable cache headers"
```

---

## Task 13: Toolchain — strict TS, flat ESLint, Prettier, and the B16 fixes

**Lands whole. Do not partially land this task** — `noUncheckedIndexedAccess` turns four latent unchecked accesses into hard build errors simultaneously.

**Files:**

- Create: `eslint.config.mjs`, `.prettierrc.json`
- Delete: `.eslintrc.json`
- Modify: `tsconfig.json`, `package.json`, `src/components/ProjectGallery.tsx`, `src/components/islands/ContactForm.tsx`

**Interfaces:**

- Consumes: everything prior
- Produces: zero-warning lint and typecheck under strict settings.

- [ ] **Step 1: Enable the stricter compiler option**

In `tsconfig.json` `compilerOptions`, add:

```json
"noUncheckedIndexedAccess": true
```

- [ ] **Step 2: Run the type checker to enumerate the failures**

Run: `npx tsc --noEmit`
Expected: **FAIL** with roughly four errors, all "possibly undefined":

| File                      | Expression                               |
| ------------------------- | ---------------------------------------- |
| `ProjectGallery.tsx`      | `images[index]` assigned to `currentSrc` |
| `ProjectGallery.tsx`      | `focusables[0]`                          |
| `ProjectGallery.tsx`      | `focusables[focusables.length - 1]`      |
| `islands/ContactForm.tsx` | `data[k]` in `encode()`                  |

- [ ] **Step 3: Fix the gallery index accesses**

In `ProjectGallery.tsx`:

```tsx
// currentSrc — images is non-empty by construction, but prove it to the compiler.
const currentSrc = images[index] ?? images[0] ?? project.cover;
```

And in the focus trap:

```tsx
const first = focusables[0];
const last = focusables[focusables.length - 1];
if (!first || !last) return;
if (e.shiftKey && document.activeElement === first) {
  e.preventDefault();
  last.focus();
} else if (!e.shiftKey && document.activeElement === last) {
  e.preventDefault();
  first.focus();
}
```

- [ ] **Step 4: Fix the form encoder**

In `islands/ContactForm.tsx`, rewrite `encode` to iterate entries rather than index by key:

```ts
function encode(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}
```

- [ ] **Step 5: Confirm the type checker is clean**

Run: `npx tsc --noEmit`
Expected: PASS, no output.

- [ ] **Step 6: Install and configure flat ESLint + Prettier**

```bash
npm install -D eslint@latest typescript-eslint eslint-plugin-jsx-a11y prettier eslint-config-prettier
npm uninstall eslint-config-next
npm install -D eslint-config-next@latest
git rm .eslintrc.json
```

Create `eslint.config.mjs`. **Verify the `eslint-config-next` flat-config entry point before relying on it** — it has moved between releases (`eslint-config-next/flat` vs. a default export). Check with `node -e "import('eslint-config-next/flat').then(m => console.log(Object.keys(m)))"` and adjust the import to match what the installed version actually exports.

```js
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import next from 'eslint-config-next/flat';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'src/data/blur.generated.ts',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  ...next,
  jsxA11y.flatConfigs.recommended,
  prettier,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
    },
  },
);
```

Create `.prettierrc.json`:

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 90,
  "trailingComma": "all"
}
```

Update `package.json` scripts:

```json
"lint": "eslint .",
"format": "prettier --write ."
```

- [ ] **Step 7: Drive lint to zero warnings**

Run: `npm run lint`
Expected initially: FAIL with a list of violations, mostly `jsx-a11y` and `strictTypeChecked`.

Fix every one. **Do not suppress with disable comments.** If a rule is genuinely wrong for this codebase, turn it off in `eslint.config.mjs` with a comment explaining why — a decision visible in one place beats scattered inline suppressions.

Re-run until: PASS with no output.

- [ ] **Step 8: Verify and commit**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test:e2e`
Expected: all pass, zero warnings.

```bash
git add -A
git commit -m "chore: strict TypeScript and flat ESLint config with zero warnings"
```

---

## Task 14: Close the remaining bug register

**Files:**

- Modify: `src/components/islands/MobileDrawer.tsx`, `src/components/TechMarquee.tsx`, `tailwind.config.ts`, `src/theme/ThemeProvider.tsx`, `src/components/ProjectGallery.tsx`, `src/components/Footer.tsx`, `src/components/islands/LanguageSwitcher.tsx`, `src/components/islands/ContactForm.tsx`, `src/components/Logo.tsx`, `src/app/globals.css`

**Interfaces:**

- Consumes: Task 8's island structure
- Produces: B1–B10 and B18 closed. B3 partially closed in Task 10; this finishes it.

- [ ] **Step 1: Write failing tests for the observable bugs**

Append to `tests/smoke.spec.ts`:

```ts
test('B1: resizing past the lg breakpoint with the drawer open restores scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ar');
  await page.getByRole('button', { name: /menu/i }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  const overflow = await page.evaluate(() => document.body.style.overflow);
  expect(overflow).not.toBe('hidden');
});

test('B2: the marquee scrolls right-to-left in Arabic', async ({ page }) => {
  await page.goto('/ar');
  const name = await page
    .locator('[data-marquee-track]')
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toContain('marquee-rtl');
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
  await page.goto('/ar');
  await expect(page.getByRole('button', { name: /switch to dark mode/i })).toBeVisible();
});

test('B7: the mobile drawer traps focus and closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ar');
  await page.getByRole('button', { name: /menu/i }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('B9: a field error clears once the field is corrected', async ({ page }) => {
  await page.goto('/en');
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /send/i }).click();
  await expect(page.locator('#name-error')).toBeVisible();
  await page.locator('#name').fill('Bay Cheikh');
  await expect(page.locator('#name-error')).toBeHidden();
});
```

- [ ] **Step 2: Run to confirm they fail**

Run: `npm run test:e2e -- --grep "B1:|B2:|B4:|B7:|B9:"`
Expected: all five FAIL.

- [ ] **Step 3: Fix B1 and B7 — the drawer**

In `MobileDrawer.tsx`: close the drawer when the viewport crosses the `lg` breakpoint, so `menuOpen` can never be stranded true while the drawer is hidden.

```tsx
useEffect(() => {
  const mq = window.matchMedia('(min-width: 1024px)');
  const onChange = (e: MediaQueryListEvent) => {
    if (e.matches) setMenuOpen(false);
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}, []);

useEffect(() => {
  if (!menuOpen) return;
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setMenuOpen(false);
  };
  document.addEventListener('keydown', onKey);
  return () => {
    document.body.style.overflow = prev;
    document.removeEventListener('keydown', onKey);
  };
}, [menuOpen]);
```

Restoring the _previous_ value rather than `''` also stops the drawer from unlocking scroll while the lightbox holds it.

Add `role="dialog"`, `aria-modal="true"`, `aria-label`, `aria-controls` on the trigger, and a focus trap matching `ProjectGallery`'s.

- [ ] **Step 4: Fix B2 — the RTL marquee**

`tailwind.config.ts` already defines `marquee-rtl`; it was never wired up. In `TechMarquee.tsx`, accept the locale and pick the direction, and add the test hook:

```tsx
export function TechMarquee({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const rtl = dirFor(locale) === 'rtl';
  // …
  <div
    data-marquee-track
    className={`flex w-max gap-10 motion-reduce:animate-none ${
      rtl ? 'animate-marquee-rtl' : 'animate-marquee'
    }`}
  >
```

- [ ] **Step 5: Fix B4 — theme initial state**

`ThemeProvider`'s hardcoded `'dark'` initial state disagrees with the DOM whenever a visitor has stored `light`. Read the class the no-flash script already applied rather than guessing:

```tsx
const [theme, setThemeState] = useState<Theme>(() => {
  if (typeof document === 'undefined') return 'dark'; // SSR: matches no-flash default
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
});
```

The `useEffect` that reads storage stays, since it also handles the OS-preference fallback.

- [ ] **Step 6: Fix B5 — the unreachable exit animation**

`ProjectGallery`'s outer `<AnimatePresence>` can never run its exit because the parent unmounts the component outright. Move `AnimatePresence` up into `ProjectsGrid.tsx` so it owns the presence of the whole lightbox:

```tsx
<AnimatePresence>
  {active && (
    <ProjectGallery project={active} startIndex={0} onClose={() => setActive(null)} />
  )}
</AnimatePresence>
```

Delete the now-redundant outer `AnimatePresence` from inside `ProjectGallery`.

- [ ] **Step 7: Fix B6 — the hydration-unstable year**

`Footer` is a server component after Task 8, so `new Date().getFullYear()` now evaluates once on the server at build time. Confirm `Footer.tsx` has no `'use client'`. That alone closes B6.

- [ ] **Step 8: Fix B8 — the language menu**

Add arrow-key navigation (`ArrowDown` / `ArrowUp` move between options, `Home` / `End` jump to the ends), and return focus to the trigger when the menu closes by any route — `Escape`, outside click, or selection. Attach the `mousedown` and `keydown` listeners only while `open` is true.

- [ ] **Step 9: Fix B9 — sticky form errors**

Clear a field's error on change:

```tsx
function clearError(field: keyof Errors) {
  setErrors((prev) => {
    if (!prev[field]) return prev;
    const next = { ...prev };
    delete next[field];
    return next;
  });
}
```

Wire `onChange={() => clearError('name')}` onto each of the three validated inputs.

- [ ] **Step 10: Fix B10 — the double-priority logo**

`Logo` takes `priority` unconditionally and is rendered in both the header and the footer, so the offscreen footer copy preloads and competes with LCP. Make it opt-in:

```tsx
export function Logo({ wordmark = true, size = 40, priority = false }: {
  wordmark?: boolean; size?: number; priority?: boolean;
}) {
```

Pass `priority` only from `Header`. Footer gets the default `false`.

- [ ] **Step 11: Fix B18 — the redundant border reset**

Delete `* { border-color: rgb(var(--border)); }` from `globals.css`. Tailwind preflight already applies a border-color default. Verify visually on both themes that no border disappears — if any does, the correct fix is a `border-border` utility on that element, not restoring the universal selector.

- [ ] **Step 12: Run everything**

Run: `npm run test:e2e`
Expected: all pass, including the five new bug tests.

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 13: Commit**

```bash
git add -A src/ tailwind.config.ts tests/
git commit -m "fix: close bug register B1-B10 and B18"
```

---

## Task 15: Measure, document, and hand off

**Files:**

- Create: `docs/superpowers/baseline/2026-07-27-after-plan-1.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: everything
- Produces: after-numbers for `MIGRATION.md` in plan 3; a README that matches reality.

- [ ] **Step 1: Measure the result**

Against the Netlify deploy preview:

```bash
npx lighthouse https://<preview>.netlify.app/ar \
  --preset=perf --form-factor=mobile --screenEmulation.mobile \
  --throttling-method=simulate --output=json --output=html \
  --output-path=./docs/superpowers/baseline/lighthouse-after-plan-1
```

Repeat for `/en`. Record Performance / Accessibility / Best Practices / SEO and LCP / CLS / TBT / INP.

- [ ] **Step 2: Record the bundle and font deltas**

```bash
curl -s https://<preview>.netlify.app/ar -o /tmp/after.html -w "%{size_download}\n"
grep -o '/_next/static/chunks/[^"]*\.js' /tmp/after.html | sort -u
grep -o '/_next/static/media/[^"]*\.woff2' /tmp/after.html | sort -u
```

Build a before/after table against Task 0's baseline. **Targets:** initial JS ≤ ~150 KB gzipped (from ~183 KB); fonts materially below 113.7 KB per locale.

If a target is missed, say so plainly with the number — do not round toward the goal. A missed target is information for plan 2, not a failure to hide.

- [ ] **Step 3: Verify Netlify Forms still works on Next 16**

This is the empirical check the owner asked for. On the deploy preview, submit the contact form with real values, then check Netlify → Forms → contact.

Record the evidence either way:

- **Works:** note the submission timestamp and move on.
- **Fails:** capture the exact HTTP status and response body from the network tab, and the Netlify Forms dashboard state. **Report to the owner and stop.** Do not propose or implement a replacement — the owner decides between staying on Netlify Forms and moving to a server action plus transactional email.

- [ ] **Step 4: Update the README**

Correct these, all now stale:

| Section | Change                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Header  | Next 16 / React 19; live URL `medmoudsite.netlify.app` (fix the `medmaoudsite` typo, B19)                               |
| §1      | No longer a single route — describe `/ar`, `/en`, `/fr` and the `/` redirect                                            |
| §3      | `motion` replaces `framer-motion`; add `@playwright/test`                                                               |
| §4      | New layout: `(site)/[locale]/`, `src/proxy.ts`, `src/i18n/locale.ts`, `src/components/islands/`                         |
| §5      | Server-first architecture with client islands; drop the "everything below is client-side" claim                         |
| §6      | Locale comes from the route, not context; cookie not `localStorage`                                                     |
| §9      | `dangerouslyAllowSVG` removed; document `images.qualities`                                                              |
| §11     | Server-rendered per-locale metadata; `DocumentMeta` deleted                                                             |
| §13     | Document `NEXT_PUBLIC_SITE_URL`                                                                                         |
| §15     | Rewrite the "three defaults" gotcha to the narrowed theme-only form; drop the "one route / Arabic-only metadata" gotcha |

- [ ] **Step 5: Note what plan 1 deliberately left undone**

Add a short section to the after-baseline document listing what is still outstanding, so plan 2 starts from a true picture: the admin panel, OG images and JSON-LD and sitemap/robots (B13's remaining half), the Prism Stack hero, the contact rework and email removal, and the full Playwright suite including axe.

- [ ] **Step 6: Final verification**

Run: `npx tsc --noEmit && npm run lint && npm run build && npm run test:e2e`
Expected: all clean, all tests pass, zero warnings.

Manually confirm on the deploy preview: all three languages render, both themes work, RTL is correct in Arabic including the marquee direction, and the lightbox opens and closes.

- [ ] **Step 7: Commit**

```bash
git add -A docs/ README.md
git commit -m "docs: record plan 1 results and update README for v2 architecture"
git push
```

---

## Self-Review Notes

**Spec coverage.** Step 0 → Task 0. Step 1 (Next 16 / React 19) → Tasks 2, 3, 4. Step 2 (localized routes) → Tasks 5, 6, 7. Step 3 (perf) → Tasks 8, 9, 10, 11. Step 4 (hardening) → Tasks 12, 13, 14. Bug register: B1, B2, B4, B5, B6, B7, B8, B9, B10, B18 → Task 14; B3 → Tasks 10 and 14; B11, B14 → Task 6; B12 → Task 12; B15 → Task 3; B16, B17 → Task 13; B19 → Tasks 0 and 15. B13 is only half-closable here — `DocumentMeta` deletion and per-locale metadata land in Task 6, but `sitemap.ts`, `robots.ts`, and `opengraph-image` belong to plan 3's SEO step and are explicitly listed as outstanding in Task 15 step 5.

**Two tensions surfaced rather than papered over.** Task 9 step 4 carries an explicit fallback because `next/font` preload behaviour for declared-but-unrendered families is not something I could verify without running it. Task 12 step 3 records that the spec's nonce-based CSP is incompatible with the static prerendering Task 6 exists to achieve, and resolves it with a build-time script hash instead — a deviation from the spec's wording that serves its intent.

**Known constraint.** `tests/locale.spec.ts` uses the Playwright runner for what are really unit tests, to avoid adding a second test framework for six assertions. If plan 2 or 3 needs real unit testing, add Vitest then and move that file.

# Mauri-Dev Portfolio v2 — Design Spec

**Date:** 2026-07-27
**Branch:** `feat/v2`
**Source brief:** `CLAUDE_CODE_PROMPT.md`

Decisions locked with the owner before writing this spec:

| Question | Decision |
|---|---|
| Canonical domain | `https://medmoudsite.netlify.app` (README's `medmaoudsite` is a typo) |
| Localized routes `/ar`, `/en`, `/fr` | Approved |
| Phase 4 hero concept | **A — Prism Stack** |

---

## 1. Baseline (measured 2026-07-27, live site)

These are the numbers `MIGRATION.md` must be compared against.

| Asset | Transferred |
|---|---|
| HTML | 84.8 KB uncompressed |
| `fd9d1056` (React) | 53.8 KB |
| `677` (framer-motion + app) | 42.5 KB |
| `23` | 31.9 KB |
| `polyfills` | 31.1 KB |
| `app/page` | 15.7 KB |
| 4 remaining chunks | 8.4 KB |
| **JS total** | **~183 KB** |
| **Fonts (5 woff2, all preloaded)** | **113.7 KB** (48.4 + 38.5 + 9.0 + 8.9 + 8.9) |

Lighthouse mobile before/after numbers are captured in step 0 of the plan and recorded in `MIGRATION.md`.

### 1.1 Correction to the brief's stated top perf problem

The brief asserts project images are fetched at `w=3840&q=70` on first render. Verified against live HTML: `w=3840` appears 14 times, which is 7 cards × (the `src` fallback attribute + the last `srcset` entry). `next/image` always emits the largest candidate as the `src` fallback. Every card already has correct `sizes` and `loading="lazy"`:

```
sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"   # browser frame
sizes="(max-width: 640px) 60vw, (max-width: 1024px) 30vw, 200px"   # phone frame
loading="lazy" ×7
```

No modern browser downloads the 3840 candidate. **Card images are not the first-load bottleneck.** The two real costs are 113.7 KB of fonts preloaded regardless of active locale, and 183 KB of JS caused by the entire tree being client-side. Effort is allocated accordingly.

---

## 2. Bug register

Every item below is fixed as part of this work. Numbering is referenced by the plan in §4.

### Confirmed defects

| # | File | Defect |
|---|---|---|
| B1 | `src/components/Header.tsx` | Drawer locks `document.body.style.overflow`. Resizing past `lg` while open hides the drawer (`lg:hidden`) but leaves `menuOpen === true`, so the page stays permanently unscrollable. |
| B2 | `src/components/TechMarquee.tsx` | Hardcodes `animate-marquee`; `tailwind.config.ts` defines an unused `marquee-rtl` keyframe. The marquee scrolls the wrong direction in Arabic — the default locale. |
| B3 | `src/app/globals.css` | The `prefers-reduced-motion` block only neutralizes CSS animations. Framer Motion writes inline styles, so every JS animation still runs for reduced-motion users. No `useReducedMotion` anywhere in the codebase. |
| B4 | `src/theme/ThemeProvider.tsx` | Initial state is hardcoded `'dark'`. A visitor with `bc-theme=light` gets a correct first paint from the no-flash script but the wrong `ThemeToggle` icon until the effect fires. |
| B5 | `src/components/ProjectGallery.tsx` | The outer `<AnimatePresence>` wraps a single always-present child while the parent unmounts it via `{active && …}`. The close/exit animation is unreachable dead code. |
| B6 | `src/components/Footer.tsx` | `new Date().getFullYear()` in a client component: server and client years differ across a timezone boundary on Dec 31 → hydration mismatch. React 19 is stricter about this. |

### Accessibility defects

| # | File | Defect |
|---|---|---|
| B7 | `src/components/Header.tsx` | Mobile drawer has no focus trap, no `Escape` handler, no `aria-controls`, and is not `role="dialog"`. |
| B8 | `src/components/LanguageSwitcher.tsx` | Declares `role="menu"` + `menuitemradio` but implements no arrow-key navigation and no focus restore to the trigger on close. |
| B9 | `src/components/ContactForm.tsx` | Errors are set on submit and never cleared while typing; a corrected field keeps its error until the next submit. |
| B10 | `src/components/Logo.tsx` | `priority` on a 40 px image rendered twice. The footer instance preloads an off-screen image, competing with LCP. |

### Architecture and configuration

| # | Location | Issue |
|---|---|---|
| B11 | `src/i18n/I18nProvider.tsx` | SSRs the Arabic dictionary unconditionally then swaps client-side. Causes a content flash for non-Arabic visitors, a second render of every section, and forces the whole tree client-side. Resolved by §3.1. |
| B12 | `netlify.toml` | No `[[headers]]` block at all — no caching directives, no security headers. |
| B13 | `src/app/` | No `sitemap.ts`, no `robots.ts`, no `opengraph-image`. |
| B14 | `src/app/layout.tsx` | `alternates.languages` maps `ar`/`en`/`fr` all to `/`. Three hreflang entries on one URL; search engines discard it. |
| B15 | `next.config.mjs` | `dangerouslyAllowSVG: true`. Verified `public/projects/**` contains zero SVGs (all jpg/jpeg/png/webp), so it is safe to delete. |
| B16 | `tsconfig.json` | Missing `noUncheckedIndexedAccess`. Enabling it surfaces four genuine unchecked accesses: `images[index]`, `focusables[0]`, `focusables[last]` in `ProjectGallery.tsx`, and `data[k]` in `ContactForm.tsx`. |
| B17 | `.eslintrc.json` | `next/core-web-vitals` alone; no `typescript-eslint`, no `jsx-a11y` beyond Next's subset. |
| B18 | `src/app/globals.css` | `* { border-color: … }` duplicates Tailwind preflight. |
| B19 | README + `layout.tsx` | Domain drift, resolved: canonical is `medmoudsite.netlify.app`; the README line is corrected. |

---

## 3. Architecture

### 3.1 Localized routes (the keystone change)

```
src/app/
  layout.tsx              # <html> shell only; no locale assumptions
  [locale]/
    layout.tsx            # per-locale <html lang dir>, fonts, metadata
    page.tsx              # server component; composes sections
    opengraph-image.tsx   # per-locale OG image via ImageResponse
  admin/                  # separate tree, English/LTR, noindex
  sitemap.ts
  robots.ts
proxy.ts                  # / → best-match locale; guards /admin/*
```

- `generateStaticParams()` returns `ar | en | fr`; all three pages prerender statically.
- `proxy.ts` redirects `/` using the `bc-locale` cookie first, then `Accept-Language`, falling back to `ar`.
- **`proxy.ts` runs on the Node.js runtime only — the `edge` runtime is not supported in Next 16 proxy and cannot be configured.** This is a benefit here: proxy is never bundled as a Netlify Edge Function, which removes the Edge bundling failure mode the brief flagged.
- Locale persistence moves from `localStorage` to a cookie so the proxy can read it. The theme stays in `localStorage`.
- **One-time migration shim.** `no-flash.tsx` reads a legacy `bc-locale` value from `localStorage`, writes it to the cookie, and removes the key — all before first paint, wrapped in the existing `try`/`catch`. Existing visitors keep their saved language across the deploy with nothing visible happening. The shim is idempotent (a no-op once the key is gone) and is scheduled for removal in a later release, noted in `MIGRATION.md`.
- `DocumentMeta.tsx` is deleted; metadata becomes fully server-rendered per locale.
- `I18nProvider` is retained only as a thin client context for the few islands that need `t()`; the dictionary for the active locale is passed down from the server, so only one dictionary ships per page.
- Anchor navigation is unchanged. Language switching becomes `router.push` against a prefetched, statically prerendered route.

**Invariant preserved:** the three defaults in `no-flash.tsx`, `DEFAULT_LOCALE`, and `ThemeProvider` must continue to agree (Arabic, RTL, dark). `no-flash.tsx` keeps handling theme; direction now comes from the server-rendered `<html>` per route, so the locale branch of the script is removed rather than left to drift.

### 3.2 Server/client split

Server by default. Client islands, each its own boundary:

`LanguageSwitcher` · `ThemeToggle` · mobile drawer · project filter + grid · lightbox (already dynamic) · `ContactForm` · hero Prism Stack layer.

Static server components: `Hero` text and stats, `About`, `Process`, `TechMarquee`, `Footer`.

### 3.3 Fonts

Load only what the active locale renders. `ar` gets Tajawal only; `en`/`fr` get Inter + Playfair Display. Exactly one font preloaded per locale (the hero face). `display: 'swap'`, tight subsets, `adjustFontFallback` on. Expected saving: ~65 KB for Arabic visitors, ~48 KB for Latin visitors, versus 113.7 KB today.

### 3.4 Animation

Migrate `framer-motion` → `motion` (the React 19-compatible successor). Wrap the app in `LazyMotion` with `domAnimation`; scroll reveals move to CSS + `IntersectionObserver`. The full feature set loads only for the lightbox and hero. `useReducedMotion` gates every JS animation (fixes B3).

### 3.5 Content store (admin)

`src/lib/content/` exposes a typed `ContentStore` interface backed by Netlify Blobs (store `site-content`, keys `projects.json` / `settings.json`).

- **Seed and fallback:** a missing or unreachable blob falls back to the bundled `src/data/projects.ts` / `src/lib/site.ts`. The public site must never render empty. Bundled files remain the typed default.
- Reads go through a cached function tagged `content`; every write calls `revalidateTag('content')`.
- All mutations are Server Actions validated with zod on the server. Every action re-verifies the session independently of the proxy.

### 3.6 Auth

`/admin` (login) and `/admin/dashboard` (protected). `ADMIN_PASSWORD_HASH` (argon2) in env, never `NEXT_PUBLIC_*`. Successful login issues a `jose`-signed JWT in an HttpOnly, Secure, SameSite=Strict cookie, ~8 h expiry, signed with `AUTH_SECRET`. Constant-time comparison, one generic error for every failure. Login is rate limited (5 attempts / 10 min / IP) with a lockout window, backed by Netlify Blobs. `/admin/*` is `noindex, nofollow`, excluded from the sitemap, disallowed in `robots.txt`, and its bundle is entirely outside the public page's critical path.

### 3.7 Uploads

Accept jpeg/png/webp/avif only. Max ~5 MB and a max dimension cap. File type verified from magic bytes, never the filename or client MIME. Every upload is re-encoded server-side with `sharp` to WebP/AVIF at multiple widths — this strips EXIF and neutralizes anything embedded in the original. The LQIP blur is generated at upload time and stored in project metadata so dynamic images get the same treatment as bundled ones; `gen-blur.mjs` continues to handle the static set. Binaries live in Netlify Blobs and are served through a route handler with long immutable cache headers, registered in `images.remotePatterns`.

### 3.8 Hero — Concept A, "Prism Stack"

Three real project screenshots as glass panes at different Z depths, angled ~12°, arranged along a diagonal. Pointer parallax (gyro on mobile) moves each depth at a different rate. A single blurred conic-gradient element sits behind them in `mix-blend-mode: screen`, so violet→indigo→cyan light appears to refract through the stack. Grain overlay. Headline and CTAs occupy the leading side; the composition mirrors under `dir="rtl"` by flipping one sign.

Retained and restyled: availability badge, headline, sub-headline, both CTAs, the 5+ / 120+ / 10+ stats row.

Budget rules, all non-negotiable:

- Text paints first; the layer never blocks and is never the LCP element.
- Loads via `dynamic(…, { ssr: false })` after idle, in its own chunk. CSS 3D transforms + one rAF loop, no WebGL, no three.js — budgeted at ~4 KB gzipped against the brief's 120 KB ceiling.
- A static poster gradient renders instantly underneath.
- Fully disabled (poster only) under `prefers-reduced-motion: reduce`, `navigator.connection.saveData`, and low-end-device heuristics (`hardwareConcurrency` / `deviceMemory`).
- Render loop pauses when the tab is hidden or the hero scrolls out of view. All listeners `{ passive: true }` and cleaned up on unmount.

### 3.9 Contact section (Phase 7)

The email address is removed from the entire public site: the `Contact.tsx` card, the `mailto:` in `Footer.tsx`, and the corresponding keys in **all three** dictionaries (removing from only one breaks the structural type check against `en.ts`). Remaining channels: the contact form, WhatsApp, and admin-managed social links. The section is recomposed around those three so it does not read as something with a hole cut out of it.

The form keeps using Netlify Forms via the `public/__forms.html` decoy; field names must continue to mirror `ContactForm.tsx` exactly. **If Netlify Forms proves unreliable on Next 16, that is an owner decision, not an implementation choice** — the work stops and asks before switching to a server action + transactional email. The owner still needs submissions by email even though the address is no longer public.

---

## 4. Ordered plan

The brief's phase numbering contains a dependency inversion: Phase 5's localized routes must precede Phase 2's server-component restructure, because client-side i18n is exactly what forces the tree client-side. Doing Phase 2 first means rewriting it during Phase 5.

| Step | Work | Brief phase | Bugs closed |
|---|---|---|---|
| 0 | Commit lockfile, record baseline Lighthouse, branch `feat/v2` | — | — |
| 1 | Next 16 + React 19 + `motion`; codemod, async request APIs, `middleware`→`proxy`, drop webpack config, declare `images.qualities`, delete `dangerouslyAllowSVG` | 1 | B15 |
| 2 | `/[locale]` routes, `proxy.ts` locale redirect, delete `DocumentMeta` | 5 (structural) | B11, B14 |
| 3 | Perf: server components + islands, per-locale fonts, `LazyMotion`, deferred below-fold content | 2 | B10 |
| 4 | Security headers, toolchain (`noUncheckedIndexedAccess`, flat ESLint + `typescript-eslint` strict + `jsx-a11y`, Prettier), all remaining bug fixes. **Lands whole — not partially.** | 6 | B1–B9, B12, B16–B19 |
| 5 | Admin: auth → `ContentStore` → CRUD + reorder → uploads → admin UX | 3 | — |
| 6 | SEO: canonical + hreflang + `x-default`, OG images per locale, JSON-LD, sitemap/robots, GSC verification, localized `alt` text, copy rewrite in all three dictionaries | 5 (rest) | B13 |
| 7 | Hero — Prism Stack | 4 | — |
| 8 | Contact rework, email removal | 7 | — |
| 9 | Playwright smoke tests + axe, `MIGRATION.md`, README | — | — |

Step 6 follows step 5 because JSON-LD `sameAs` is populated from the admin's social links. Step 8 follows step 5 for the same reason.

Every step ends with `npx tsc --noEmit`, `npm run lint`, and `npm run build` passing clean — no errors, no warnings, no `@ts-ignore`, no `any` — and its own focused commit. `main` is never left broken.

---

## 5. Next 16 migration notes

Verified against the Next.js 16.2.9 upgrade documentation:

- **`middleware.ts` → `proxy.ts`.** The named export `middleware` becomes `proxy`; `skipMiddlewareUrlNormalize` becomes `skipProxyUrlNormalize`. The `edge` runtime is **not** supported in proxy and cannot be configured — proxy is Node.js only. Auth logic stays out of proxy; proxy handles routing and headers, and every server action re-verifies the session itself.
- **Async request APIs.** `params`, `searchParams`, `cookies()`, `headers()`, and `draftMode()` are promises. Synchronous access is fully removed, not merely deprecated.
- **`images.qualities`.** The default changed to `[75]`. An unlisted `quality` **prop** is coerced to the nearest allowed value rather than erroring, but a direct request to the image API with an unlisted quality returns 400 — which affects previously cached `q=70` URLs. The project uses 70 / 78 / 55, so `qualities: [55, 70, 75, 78]` is declared explicitly.
- **Turbopack is the only bundler.** Custom webpack config in `next.config.mjs` is silently ignored; the current config has none, so there is nothing to port.
- `sharp` stays in `dependencies` — Netlify's `prebuild` runs `gen:blur`.
- React 19 enforces hydration more strictly than 18. Every hydration warning is hunted down, particularly around `no-flash.tsx`, `suppressHydrationWarning`, and B4/B6.

---

## 6. Targets and definition of done

**Lighthouse mobile, simulated 4G:** Performance ≥ 95 · Accessibility ≥ 95 · Best Practices ≥ 95 · SEO 100.
**Vitals:** LCP < 2.0 s · CLS < 0.05 · TBT < 200 ms · INP < 200 ms.
**Initial JS:** ≤ ~150 KB gzipped (from ~183 KB).

Done means:

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
- Netlify preview works in all three languages, both themes, on a real phone.
- Before/after Lighthouse numbers recorded in `MIGRATION.md`.
- Admin flow end to end without a redeploy: log in → add a project with images in three languages → reorder → edit the WhatsApp number → add social links → delete a project, each visible on the public site.
- No email address anywhere on the public site (`grep` for `baymed000@gmail.com` and `mailto:` returns nothing in `src/` or `public/`).
- Hero reads as premium bespoke work and stays inside its budget.
- README and `MIGRATION.md` updated with the exact list of env vars to set in the Netlify dashboard.

**Env vars to be configured in Netlify** (final list confirmed in `MIGRATION.md`): `ADMIN_PASSWORD_HASH`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, `GSC_VERIFICATION`.

---

## 7. Preserved invariants

1. The defaults in `no-flash.tsx`, `i18n/config.ts` (`DEFAULT_LOCALE`), and `ThemeProvider` must always agree. Note the shape of this invariant changes in step 2: once `lang`/`dir` are server-rendered per route, `no-flash.tsx` no longer touches locale, so the runtime agreement it must maintain narrows to **theme only** (`no-flash.tsx` ↔ `ThemeProvider`). `DEFAULT_LOCALE` remains the fallback the proxy uses when no cookie and no `Accept-Language` match. This narrows the invariant, it does not remove it — the README is updated to describe the new shape rather than the old one.
2. The three dictionaries (`ar`, `en`, `fr`) stay structurally identical; `en.ts` is the type source of truth.
3. `src/data/blur.generated.ts` is generated and never hand-edited.
4. Arabic + RTL + dark remain the defaults.
5. `public/__forms.html` field names mirror `ContactForm.tsx` exactly.
6. `category` (filter + lightbox layout) and `frame` (card cover only) remain distinct; the admin UI labels them clearly so they are not confused.

---

## 8. Open items requiring an owner decision

These are not blocking the plan; each is raised at the point it is reached.

1. **Netlify Forms on Next 16.** Verified empirically, not assumed: the form is submitted on a real Netlify deploy preview and the result checked in Netlify → Forms → contact. Evidence (submission visible or the exact failure) is reported to the owner **before** any replacement is proposed. If it does fail, the owner chooses between staying and moving to a server action + transactional email. Not decided unilaterally.
2. **Custom domain.** `medmoudsite.netlify.app` is canonical today; a custom domain is likely later. The canonical origin therefore lives in exactly one place — `NEXT_PUBLIC_SITE_URL`, read once into a single exported constant in `src/lib/site.ts` — and `metadataBase`, canonical URLs, `hreflang` alternates, OG image URLs, `sitemap.ts`, and `robots.ts` all derive from that constant. Switching domains is a one-line env change with no code edit. No hardcoded origin is permitted anywhere else; step 4's lint pass checks for stray literals.
3. **Project catalog content.** The seven existing projects carry over unchanged. **No catalog entry is ever deleted or rewritten without asking the owner first** — this includes titles, descriptions, and per-locale copy. The Phase 6 marketing-copy rewrite covers the dictionaries (`src/i18n/dictionaries/**`), not `src/data/projects.ts`; any proposed change to project copy is raised as a question, not applied.

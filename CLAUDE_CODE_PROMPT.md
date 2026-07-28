# Mauri-Dev Portfolio — Upgrade & Rebuild Brief

You are working on the **Mauri-Dev** portfolio (Next.js 14 App Router, React 18, TypeScript strict, Tailwind 3, Framer Motion, deployed on Netlify). The repo README documents the current architecture — **read it fully before touching anything**, plus `src/app/page.tsx`, `src/app/providers.tsx`, `src/app/no-flash.tsx`, `src/data/projects.ts`, `src/lib/site.ts`, `src/i18n/**`, `src/components/**`, `next.config.mjs`, `netlify.toml`, `scripts/**`.

**Live site:** https://medmoudsite.netlify.app
**Note:** the README and `layout.tsx` still point `metadataBase` / `SITE_URL` at `https://baycheikh.netlify.app`, which no longer matches the deployed domain. Confirm the canonical domain with me, then fix it everywhere.

---

## 0. Ground rules

1. **Run `/find-skills` first.** Load every relevant skill — frontend design, animation/3D, performance, security — before writing code. Use them; don't improvise a look.
2. Work on a branch (`feat/v2`). Small, focused commits with clear messages. Never leave `main` broken.
3. **Plan before each phase.** Print the file list you intend to touch and what changes, then execute.
4. Ask me before anything destructive or ambiguous (deleting projects data, changing the canonical domain, adding a paid service).
5. **After every phase, all of these must pass:** `npx tsc --noEmit`, `npm run lint`, `npm run build`. No errors, no warnings, no `@ts-ignore`, no `any`.
6. Preserve the invariants the README calls out:
   - The three defaults in `no-flash.tsx`, `i18n/config.ts` (`DEFAULT_LOCALE`), and `ThemeProvider` must always agree.
   - The three dictionaries (`ar`, `en`, `fr`) must stay structurally identical — `en.ts` is the type source of truth.
   - `src/data/blur.generated.ts` is generated. Never hand-edit it.
   - Arabic + RTL + dark theme remain the defaults.
7. Deliver a `MIGRATION.md` at the end: what changed, why, before/after Lighthouse numbers, new env vars, and anything I must configure in the Netlify dashboard.
8. Keep the README updated as you go — it is the project's real documentation.

---

## Phase 1 — Upgrade to Next.js 16 + React 19

**Goal:** the project runs on Next.js 16 (Turbopack, React 19) with zero regressions.

- Node 20.9+ baseline. Commit the lockfile before upgrading so the dependency diff is reviewable.
- Run `npx @next/codemod@canary upgrade latest`, then fix everything the codemod couldn't:
  - **Async request APIs** — `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` are promises now; synchronous access is fully removed.
  - **`middleware.ts` → `proxy.ts`** (new convention). Keep auth logic out of proxy — proxy is for routing/headers only.
  - **Turbopack is the only bundler.** Any custom webpack config in `next.config.mjs` is silently ignored — audit and remove or replace it.
  - **`next/image` defaults changed.** Re-verify `formats`, and note that non-default `quality` values must now be declared in `images.qualities` in `next.config.mjs` — the project uses 70/78/55, so declare them or the images break.
  - Upgrade `react`, `react-dom`, `@types/react`, `@types/react-dom` as a set (React 19).
  - Migrate `framer-motion` to its React 19-compatible successor package (`motion`) and update all imports.
  - `sharp` stays in `dependencies` (Netlify's `prebuild` runs `gen:blur`).
- **Delete `dangerouslyAllowSVG`** from `next.config.mjs` — it's legacy and it's an XSS surface. Confirm no SVGs are served through `next/image` first.
- Confirm the deploy works on Netlify with Next 16 (it is supported; make sure the Next.js Runtime is on the current version and that the Edge Functions bundling step succeeds — this is a known failure point on 16).
- React 19 enforces hydration stricter than 18: hunt down and fix every hydration warning, especially around `no-flash.tsx` and `suppressHydrationWarning`.

---

## Phase 2 — First-load performance (this is a top priority)

The site is noticeably slow on first visit. **Measure first, then fix, then measure again.** Record before/after Lighthouse mobile scores in `MIGRATION.md`.

### Confirmed problems to fix

1. **Project images are being requested at `w=3840&q=70` on the initial page render.** Check the live HTML: every card image resolves to `/_next/image?url=...&w=3840&q=70`. That alone can be several megabytes before the page is interactive. Fix the `sizes` attribute on every `next/image` so the browser picks a sane candidate (cards are roughly a third of the viewport on desktop, full width on mobile). Verify in DevTools that a mobile visitor downloads images in the ~400–800px range, not 3840px.
2. **Almost the entire tree is client-side.** `ThemeProvider > I18nProvider` are client components, so every section below them ships as client JS, including static content (About, Process, Footer, TechMarquee). Restructure so the page is server-rendered by default with small client islands: language switcher, theme toggle, mobile drawer, project filter, lightbox, contact form, hero 3D layer. See Phase 5 for how the i18n change makes this possible.
3. **Three font families** (Playfair Display, Inter, Tajawal) load for a site whose default language is Arabic. Only load what the active locale actually renders; preload exactly one font for the hero; use `display: 'swap'`, tight subsets, and `adjustFontFallback` to prevent layout shift.
4. **Framer Motion in the initial bundle.** Reveal animations don't need the full library — use `LazyMotion` with the domAnimation feature set, or replace scroll reveals with CSS + IntersectionObserver and reserve the animation library for the lightbox and hero only.
5. **Below-the-fold work runs immediately.** Defer TechMarquee, Process, Contact and Footer (dynamic import or `content-visibility: auto`) and make sure the marquee's infinite animation isn't running before it's visible.

### Also do

- Hero: LCP element must be plain server-rendered HTML/text with the hero image (if any) `priority` + `fetchPriority="high"` + explicit dimensions. Nothing that blocks paint.
- Prerender the page statically (or with a long ISR revalidate, tag-invalidated by the admin panel — see Phase 3) so visitors hit CDN HTML, not a cold serverless function.
- Cache headers in `netlify.toml`: immutable long-cache for `/_next/static/*`, `/projects/*`, and uploaded media.
- Preconnect only where it earns its place; drop any unused third-party origin.
- Trim: `npm audit`, remove unused dependencies, unused Tailwind, unused dictionary keys, dead components.

### Targets (mobile, simulated 4G, Lighthouse)

- Performance ≥ 95 · Accessibility ≥ 95 · Best Practices ≥ 95 · SEO 100
- LCP < 2.0s · CLS < 0.05 · TBT < 200ms · INP < 200ms
- Initial JS ≤ ~150 KB gzipped

---

## Phase 3 — `/admin` panel (password-protected content management)

Right now every content change requires a code edit and a redeploy. Build a real admin panel so the site owner can manage content from the browser.

### Auth

- Routes: `/admin` (login) and `/admin/dashboard` (protected).
- Password lives **only** in an env var — store a hash (`ADMIN_PASSWORD_HASH`, argon2/bcrypt/scrypt), never plaintext, never `NEXT_PUBLIC_*`.
- On success, issue a signed JWT (use `jose`) in an **HttpOnly, Secure, SameSite=Strict** cookie, ~8h expiry, signed with `AUTH_SECRET`. Support logout (cookie clear).
- Constant-time comparison; one generic error message for every failure.
- **Rate limit** login attempts (e.g. 5 per 10 minutes per IP) with a lockout window, backed by Netlify Blobs.
- `proxy.ts` guards `/admin/*` and `/api/admin/*`; every server action re-verifies the session independently (never trust proxy alone).
- `/admin/*` gets `noindex, nofollow`, is excluded from the sitemap, and is disallowed in `robots.txt`.

### Data layer

- Introduce `src/lib/content/` exposing a typed `ContentStore` interface, implemented over **Netlify Blobs** (`@netlify/blobs`), store name e.g. `site-content`, keys `projects.json` and `settings.json`.
- **Seed from the existing bundled data**: if a blob is missing, fall back to the current `src/data/projects.ts` / `src/lib/site.ts` values. The site must never render empty because storage is cold or unreachable. Keep the bundled files as the typed default/fallback.
- Reads go through a cached function tagged `content`; every write calls `revalidateTag('content')` so the public page updates without a redeploy.
- All mutations are **Server Actions**, validated with **zod** on the server. Never trust client input.

### What the admin can manage

**Projects** (full CRUD + reorder — order in the list is display order):

- `id` (auto-slugified, unique, immutable after creation)
- `title` and `description` for **all three locales** (ar / en / fr) — enforce all three before saving
- `category`: `web` | `app` (drives filter pills + lightbox layout)
- `frame`: `phone` | `browser` (drives card cover only) — label this clearly in the UI so the two aren't confused
- `cover` image
- `images[]` — multi-upload, reorder, delete individually
- `link` — optional live URL, validated, `https` only

**Site settings:**

- WhatsApp number + the prebuilt `wa.me` URL (keep them derived from one field so they can't drift apart)
- **Social links** — add/edit/remove/reorder a list of `{ platform, url, label }`; these render in the Footer and Contact section (and header if it fits the design)
- Hero stats (years of experience, projects delivered, stacks) and the "available for work" badge toggle

### Image uploads

- Accept jpeg/png/webp/avif only; enforce a max size (~5 MB) and max dimensions; verify the real file type from its magic bytes, not the filename or client-sent MIME.
- **Re-encode every upload server-side with `sharp`** to WebP/AVIF — this strips EXIF and neutralizes anything embedded in the original file. Generate multiple widths.
- Generate the LQIP blur placeholder at upload time and store it in the project metadata, so dynamic images get the same blur treatment as the bundled ones. `gen-blur.mjs` keeps handling the static ones.
- Store binaries in Netlify Blobs; serve through a route handler with long immutable cache headers, and register the domain in `images.remotePatterns` (or write a custom loader) so `next/image` still optimizes them.

### Admin UX

- Clean, fast, English/LTR, entirely separate from the public i18n dictionaries (don't pollute them).
- Table/grid of projects with drag-or-arrow reordering, inline status, and a real edit form with per-locale tabs.
- Optimistic UI, toasts on success/failure, confirmation dialog before any delete, unsaved-changes guard.
- Show a preview link to the public page after publishing.
- Ship the admin bundle **outside** the public page's critical path — it must not add a single byte to the visitor-facing first load.

---

## Phase 4 — New hero: elegant, premium, 3D

The current hero is competent but plain. It's the first thing a prospective client sees and it should immediately say "this developer is expensive and worth it."

- **Run `/find-skills` and use the design/3D skills** for the aesthetic direction. Give me **2–3 distinct concepts** (short description + the key visual mechanic of each) before you build. I'll pick one.
- It must be **original and bespoke** — not a template, not a generic particle field, not an AI-slop gradient blob. Something with a real idea behind it: layered glass panes carrying actual project screenshots, a subtle device-shard composition, pointer-reactive parallax depth, an animated mesh/aurora in the brand violet→indigo→cyan range, grain, kinetic Arabic typography that respects RTL.
- Keep and restyle: the availability badge, headline, sub-headline, both CTAs, the stats row (5+ / 120+ / 10+).
- **RTL-correct.** Every directional element mirrors properly in Arabic. Test all three languages.

### Non-negotiable performance rules for the 3D layer

- Never blocks or becomes the LCP element. Text paints first, always.
- Loads via `dynamic(..., { ssr: false })` after hydration/idle, ≤ ~120 KB gzipped in its own chunk.
- Static poster/gradient fallback renders instantly underneath it.
- Fully disabled (fallback only) under `prefers-reduced-motion: reduce`, on `navigator.connection.saveData`, and on low-end devices (`hardwareConcurrency` / `deviceMemory` heuristics).
- DPR capped (~1.5–2), render loop paused when the tab is hidden or the hero scrolls out of view, all listeners `{ passive: true }` and cleaned up on unmount.
- If it can't hit these budgets with WebGL, use CSS 3D transforms + canvas instead. **Performance wins over spectacle.**

---

## Phase 5 — SEO

**Recommended structural change (propose it to me, then implement if I approve):** move from one route to real localized routes — `/ar`, `/en`, `/fr` — with `/` redirecting to the visitor's best match. This solves three problems at once: per-language URLs and `hreflang` for crawlers, fully server-rendered localized content (no more client-only i18n tree, which is also the biggest Phase 2 win), and correct localized metadata. Anchor navigation and instant language switching stay exactly as they are today.

Regardless of that decision:

- Fix `metadataBase` / `SITE_URL` to the real domain and add a **canonical** URL to every page.
- Add `alternates.languages` / `hreflang` for ar, en, fr plus `x-default`.
- **Add an Open Graph image** — the live site currently has `og:title`/`og:description` but no `og:image`, so every share link renders bare. Generate it per locale with `ImageResponse` (`opengraph-image.tsx`) and mirror it for Twitter.
- **JSON-LD structured data**: `Person` (Bay Cheikh / Med Moud) with `sameAs` pulled from the admin's social links, `WebSite`, `ProfessionalService` with `areaServed`, and an `ItemList` / `CreativeWork` entry per portfolio project.
- `sitemap.ts` and `robots.ts` (admin disallowed). Add a Google Search Console verification meta driven by an env var.
- One `<h1>` per page, a clean heading hierarchy, and **descriptive localized `alt` text on every image** (currently generic).
- **Rewrite the marketing copy in all three dictionaries** to be genuinely compelling and to carry the terms clients actually search — Arabic (`مطور مواقع`, `مبرمج تطبيقات`, `تصميم مواقع موريتانيا`, `نواكشوط`), French (`développeur web freelance`, `application mobile`, `Mauritanie`), English (`full stack developer`, `React Native`, `Next.js`, `freelance`). Natural and persuasive, never keyword-stuffed. Headlines should sell outcomes, not job titles.
- Core Web Vitals are a ranking factor — Phase 2 is part of the SEO work.

---

## Phase 6 — Security & code quality

- **Security headers** (in `netlify.toml` or Next's `headers()`): a real Content-Security-Policy (nonce-based — the `no-flash` inline script needs a nonce or hash), HSTS with preload, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera/mic/geolocation, `frame-ancestors 'none'`.
- No secret ever reaches the client bundle. Grep for `NEXT_PUBLIC_` and audit every hit.
- Server Actions: verify session + validate with zod inside every action; rely on SameSite=Strict plus Next's origin checks for CSRF.
- No `dangerouslySetInnerHTML` anywhere except the audited no-flash script.
- Contact form: keep the honeypot, add server-side rate limiting, and validate on the server as well as the client.
- `npm audit` clean (or documented and justified); no unmaintained or unused dependencies.
- **Fix every existing bug you find.** Read the code critically: memory leaks from uncleaned listeners/observers, stale closures, missing `key`s, race conditions in the lightbox preloader, focus-trap edge cases, `localStorage` access without a try/catch (private mode throws), the RTL keyboard-direction logic, error states with no recovery path.
- Tighten the toolchain: TypeScript strict with `noUncheckedIndexedAccess`, ESLint flat config with `typescript-eslint` strict + `jsx-a11y`, Prettier. Zero warnings.
- Add a light safety net: Playwright smoke tests covering page load in all three locales, opening the lightbox, submitting the contact form, and the full admin login → create project → verify on the public page flow. Plus an axe accessibility check.

---

## Phase 7 — Contact section changes

- **Remove the email address from the public site entirely** — the email card in `Contact.tsx`, the `mailto:` in `Footer.tsx`, and any other reference. Grep for `baymed000@gmail.com` and `mailto:` and make sure nothing survives, including in all three dictionaries (remove the keys from `ar`, `en` **and** `fr` so they stay structurally identical, or the build fails).
- Contact channels become: the contact form, WhatsApp, and the new social links from the admin panel. Redesign the section so it doesn't look like something was cut out of it — it should feel intentionally composed around those channels.
- Keep the contact form working. It uses Netlify Forms via the `public/__forms.html` static decoy; verify that still works on Next 16 with the current Netlify runtime and that field names still mirror `ContactForm.tsx` exactly. If Netlify Forms proves unreliable with Next 16, tell me before switching to an alternative (server action + transactional email) so I can decide — the owner still needs to receive submissions by email even though the address is no longer public.

---

## Definition of done

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.
- Deployed preview on Netlify works in all three languages, both themes, on a real phone.
- Lighthouse mobile: Performance ≥ 95, Accessibility ≥ 95, Best Practices ≥ 95, SEO 100. Before/after numbers in `MIGRATION.md`.
- Admin panel: log in, add a project with images in three languages, reorder it, edit the WhatsApp number, add social links, delete a project — all visible on the public site **without a redeploy**.
- No email address anywhere on the public site.
- Hero looks like premium bespoke work and doesn't cost more than its budget.
- README and `MIGRATION.md` updated, with the exact list of env vars to set in Netlify.

**Start by reading the codebase and giving me: (a) an audit of what you found, including any bugs, (b) your ordered plan, (c) the hero concepts for Phase 4, and (d) your recommendation on the localized-routes question in Phase 5. Don't write implementation code until I've responded.**

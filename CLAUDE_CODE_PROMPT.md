# Mauri-Dev Portfolio — Upgrade & Rebuild Brief

> ## Read this header before acting on any Phase below
>
> This file is the **original** brief. Parts of it have been superseded by later
> instructions. A Phase number is not a Plan number — the work was delivered in
> three plans that do not map one-to-one onto the seven Phases here, and
> confusing the two numberings has already caused a session to act on a
> cancelled instruction.
>
> **What actually delivered what:**
>
> | Delivered by | Covers | Recorded in |
> | --- | --- | --- |
> | **Plan 1** | Phase 1 (Next 16 / React 19), Phase 2 (first-load performance), Phase 5's localized-routes decision, Phase 6 (security, strict TS, tests) | `PROGRESS.md` tasks 10b–15, `MIGRATION.md` §1–§8 |
> | **Plan 2** | Phase 3 (`/admin` panel, content store, auth, uploads), the security headers and CLS items left open by plan 1 | `PROGRESS.md` "Plan 2" tasks 1–12c, `MIGRATION.md` §9–§10 |
> | **Social links rebuild** | The Phase 3 "social links" bullet, replaced with eight fixed per-platform fields. **Also cancelled Phase 7's email removal.** | `PROGRESS.md` "Fixed per-platform social fields", commit `549a61b` |
> | **Plan 3** | **Replaces Phase 4 entirely.** Hero, motion, palette. | `docs/plan-3-brief.md` |
>
> **Superseded — do not act on these Phases as written:**
>
> - **Phase 4** — superseded in full by `docs/plan-3-brief.md`. See the Phase 4
>   section below, which now contains only that pointer.
> - **Phase 7, first bullet** — the instruction to remove the email address was
>   **cancelled**. See Phase 7 below.
> - **Definition of done, "No email address anywhere on the public site"** —
>   cancelled by the same decision. The email is a published contact channel.
>
> **Still open, not yet delivered:** the remaining Phase 5 SEO items —
> `sitemap.ts`, `robots.ts`, OG images, JSON-LD. These get their own pass after
> the hero lands.

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

## Phase 4 — SUPERSEDED. The hero brief now lives at `docs/plan-3-brief.md`

**Do not implement anything from the old Phase 4. Read `docs/plan-3-brief.md`
instead — it replaces this Phase entirely.**

Nothing of the old Phase 4 survives. Its 3D framing, its ≤120 KB chunk budget
and its "2–3 concepts" instruction are all void; the replacement brief sets its
own direction, its own budgets and its own process, and they differ. Quoting the
old text back at the owner is a bug, not diligence.

If `docs/plan-3-brief.md` is missing from the working tree, stop and ask rather
than falling back to this section.

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

- **THE EMAIL STAYS. Do not remove it.** This bullet previously ordered the
  email address stripped from the public site and its keys deleted from the
  three dictionaries. **That instruction is cancelled and stays cancelled.** The
  owner reversed it deliberately.

  The email is now a **settings field**, editable in the admin panel, rendered on
  the public site as a **contact pill** alongside WhatsApp, in both the footer
  and the contact section, in all three locales. It is a published contact
  channel and part of the delivered design.

  This is not a preference, a default, or something to re-raise. Do not remove
  `baymed000@gmail.com`, do not remove the `mailto:`, do not delete the email
  keys from `ar`, `en` or `fr`, and do not "tidy" the email pill out of
  `Contact.tsx` or `Footer.tsx` as part of unrelated work. A future session that
  reads this bullet as optional, or as merely deferred, has misread it. If a
  task appears to require removing the email, that task is wrong — stop and ask.
- Contact channels are: the contact form, WhatsApp, **email**, and the social links from the admin panel. The section should feel intentionally composed around those channels.
- Keep the contact form working. It uses Netlify Forms via the `public/__forms.html` static decoy; verify that still works on Next 16 with the current Netlify runtime and that field names still mirror `ContactForm.tsx` exactly. If Netlify Forms proves unreliable with Next 16, tell me before switching to an alternative (server action + transactional email) so I can decide — the owner still needs to receive submissions by email.

---

## Definition of done

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.
- Deployed preview on Netlify works in all three languages, both themes, on a real phone.
- Lighthouse mobile: Performance ≥ 95, Accessibility ≥ 95, Best Practices ≥ 95, SEO 100. Before/after numbers in `MIGRATION.md`.
- Admin panel: log in, add a project with images in three languages, reorder it, edit the WhatsApp number, add social links, delete a project — all visible on the public site **without a redeploy**.
- ~~No email address anywhere on the public site.~~ **Cancelled** — see Phase 7. The email is a published contact channel with its own pill.
- Hero looks like premium bespoke work and doesn't cost more than its budget.
- README and `MIGRATION.md` updated, with the exact list of env vars to set in Netlify.

**Start by reading the codebase and giving me: (a) an audit of what you found, including any bugs, (b) your ordered plan, (c) the hero concepts for Phase 4, and (d) your recommendation on the localized-routes question in Phase 5. Don't write implementation code until I've responded.**

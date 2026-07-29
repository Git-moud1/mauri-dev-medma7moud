# Mauri-Dev — Portfolio Website

A premium, single-page, multilingual (Arabic / English / French) portfolio and marketing site for
**Mauri-Dev** — the brand of **Bay Cheikh (Med Moud)**, Full Stack & Mobile App Developer.

Built with **Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 3 · motion**,
deployed on **Netlify**.

- **Live:** https://medmoudsite.netlify.app
- **Contact:** baymed000@gmail.com · WhatsApp [+222 31 31 75 01](https://wa.me/22231317501)

---

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [Quick start](#2-quick-start)
3. [Tech stack](#3-tech-stack)
4. [Repository layout](#4-repository-layout)
5. [Architecture & key decisions](#5-architecture--key-decisions)
6. [Internationalization (i18n)](#6-internationalization-i18n)
7. [Theming & design system](#7-theming--design-system)
8. [Projects data & the gallery lightbox](#8-projects-data--the-gallery-lightbox)
9. [Images pipeline (blur placeholders & mockups)](#9-images-pipeline-blur-placeholders--mockups)
10. [Contact form (Netlify Forms)](#10-contact-form-netlify-forms)
11. [Admin panel & the content store](#11-admin-panel--the-content-store)
12. [SEO & metadata](#12-seo--metadata)
13. [Accessibility & performance](#13-accessibility--performance)
14. [Deployment](#14-deployment)
15. [Common tasks / cookbook](#15-common-tasks--cookbook)
16. [Gotchas](#16-gotchas)

---

## 1. What this project is

A portfolio site with **one localized route per language** — `/ar`, `/en`, `/fr` — each statically
prerendered. `/` 307-redirects to the visitor's best match (cookie, then `Accept-Language`, then
Arabic). Within a route, navigation is still anchors, and switching language is still instant.
Its purpose is to convert visitors into clients: show credibility, show real work, and give one-tap
access to WhatsApp / contact form.

Page sections, in render order (`src/app/(site)/[locale]/page.tsx`):

| Order | Component          | Anchor      | Purpose                                                                         |
| ----- | ------------------ | ----------- | ------------------------------------------------------------------------------- |
| 1     | `Header`           | —           | Fixed nav, language switcher, theme toggle, WhatsApp CTA, mobile drawer         |
| 2     | `Hero`             | `#top`      | Headline, availability badge, CTAs, stats (5+ yrs / 120+ projects / 10+ stacks) |
| 3     | `TechMarquee`      | —           | Infinite-scrolling tech logos strip (RTL-aware)                                 |
| 4     | `About`            | `#about`    | Bio, skills grouped by Languages / Frameworks / Mobile, 3 highlight cards       |
| 5     | `Projects`         | `#projects` | Filterable project grid (All / Web / App) + lightbox gallery                    |
| 6     | `Process`          | `#process`  | 4-step method: Discover → Design → Build → Launch                               |
| 7     | `Contact`          | `#contact`  | Contact form + WhatsApp + email cards                                           |
| 8     | `Footer`           | —           | Nav, connect links, copyright                                                   |
| 9     | `FloatingWhatsApp` | —           | Persistent floating WhatsApp button                                             |

Metadata is server-rendered per locale by `generateMetadata`; the old client-side `DocumentMeta`
is gone.

The projects, the hero stats, the availability badge, the WhatsApp number and the social links
are **read from the content store** and edited at `/admin` — see §11. The bundled files stay as
the typed fallback.

**Defaults:** language **Arabic (RTL)**, theme **dark** (falls back to `prefers-color-scheme`).
The locale comes from the route and is remembered in the `bc-locale` **cookie** so the proxy can
read it. The theme lives in `localStorage` and is applied _before first paint_ by the inline
no-flash script, which no longer touches `lang`/`dir` — those are server-rendered.

---

## 2. Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script                                | What it does                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`                         | Next dev server                                                                     |
| `npm run build`                       | Runs `prebuild` (`gen:blur`) then `next build`                                      |
| `npm start`                           | Serves the production build                                                         |
| `npm run lint`                        | `eslint .` — ESLint 9 flat config, `typescript-eslint` strictTypeChecked + jsx-a11y |
| `npm run format` / `format:check`     | Prettier over the repo                                                              |
| `npm run test:e2e`                    | Full Playwright suite (mobile + desktop projects)                                   |
| `npm run test:headers`                | Header assertions — only meaningful against a deploy, see §14                       |
| `npm run gen:blur`                    | Regenerates LQIP blur placeholders → `src/data/blur.generated.ts`                   |
| `node scripts/gen-admin-secrets.mjs`  | Generates `ADMIN_PASSWORD_HASH` + `AUTH_SECRET`, printing nothing — see §11         |
| `node scripts/gen-mockups.mjs`        | Rebuilds the synthetic mockup screens (network required — see §9)                   |
| `node scripts/measure-bundle.mjs URL` | First-load JS and fonts, gzipped. Owns its own server — see §13                     |
| `node scripts/measure-cls.mjs URL`    | CLS on a scripted scroll. Owns its own server                                       |

> `prebuild` is wired into `build`, so blur placeholders are always regenerated on deploy.
> `sharp` is a **runtime dependency** (not devDependency) for exactly this reason.

**Node 20.9+ is required, not merely recommended** — that is Next 16's floor. Netlify builds
on the `NODE_VERSION = "22.11.0"` pinned in `netlify.toml`; match it locally if a build
behaves differently on the two.

Writes from the admin panel need a Netlify runtime. `npm run dev` reads fine and cannot
save — see §11.

---

## 3. Tech stack

**Runtime deps**

| Package               | Version  | Used for                                                                     |
| --------------------- | -------- | ---------------------------------------------------------------------------- |
| `next`                | 16.2.12  | App Router (Turbopack), `next/image`, `next/font`, `proxy.ts`                |
| `react` / `react-dom` | 19.2.8   | UI                                                                           |
| `motion`              | ^12.42.2 | Lightbox slides/drag, island animations (scroll reveals are CSS)             |
| `sharp`               | ^0.35.3  | Build-time blur LQIP, mockup rasterization, **and admin upload re-encoding** |
| `@netlify/blobs`      | ^10.7.10 | The content store and the login rate limiter                                 |
| `zod`                 | ^4.4.3   | Schemas for stored projects, settings and every server action's input        |
| `jose`                | ^6.2.4   | Signs and verifies the admin session JWT                                     |
| `@node-rs/argon2`     | ^2.0.2   | argon2id password verification                                               |

**Dev deps:** TypeScript 5.5 (`strict` + `noUncheckedIndexedAccess`), Tailwind 3.4,
PostCSS + Autoprefixer, ESLint 9 flat config (`typescript-eslint` strictTypeChecked +
`eslint-plugin-jsx-a11y` + `eslint-config-next`), Prettier, `@playwright/test`.

**Notably absent by design:** no i18n library, no state manager, no UI kit, no icon package
(icons are hand-written inline SVGs in `src/components/Icons.tsx`), no CMS. Everything is local
and type-safe, which keeps the bundle small and the site fully static-friendly.

Path alias: `@/*` → `./src/*` (see `tsconfig.json`).

---

## 4. Repository layout

```
.
├── netlify.toml               # Netlify build config, NODE_VERSION, CACHE headers only
├── next.config.mjs            # security headers + CSP, image formats (avif/webp)
├── tailwind.config.ts         # design tokens mapped to CSS vars, keyframes
├── postcss.config.mjs
├── tsconfig.json              # strict TS + noUncheckedIndexedAccess, "@/*" alias
├── eslint.config.mjs          # ESLint 9 flat, typescript-eslint strictTypeChecked
├── .env.example               # variable NAMES only — the repo is public
│
├── public/
│   ├── mauri-dev.jpeg         # brand/profile image
│   ├── __forms.html           # hidden static form so Netlify can detect the React form
│   ├── fonts/tajawal-*.woff2  # self-hosted Arabic faces (3 weights x 2 subsets) — §7
│   └── projects/<id>/…        # real project screenshots (jpg / jpeg / png / webp)
│
├── scripts/
│   ├── measure-bundle.mjs     # first-load JS + fonts, gzipped — owns its own server
│   ├── measure-cls.mjs        # CLS on a scripted scroll — owns its own server
│   ├── port.mjs               # frees a port and refuses to continue if it cannot
│   ├── gen-admin-secrets.mjs  # writes .env.admin.local (0600), prints nothing secret
│   ├── gen-blur.mjs           # walks public/projects/** → base64 LQIP map
│   ├── gen-mockups.mjs        # SVG templates + real photos → high-res WebP screens
│   ├── photos.mjs             # named photo tokens → fetched & processed JPEG buffers
│   └── mockups/<project>/*.svg# mockup screen templates (__PH_<token>__ placeholders)
│
├── tests/
│   ├── smoke.spec.ts          # public-site suite — several PROTECTED tests, see the file
│   ├── headers.spec.ts        # PROTECTED. Delivered headers; deploy-only
│   ├── csp.spec.ts            # the CSP does not block what the site needs
│   ├── auth.spec.ts           # password / session / fail-closed unit tests
│   ├── content.spec.ts        # store schemas and the bundled-data fallback
│   ├── images.spec.ts         # magic-byte sniffing, re-encode, EXIF stripping
│   ├── locale.spec.ts         # locale negotiation unit tests
│   └── global-setup.ts        # warms the next/image cache so a cold run is not flaky
│
└── src/
    ├── proxy.ts               # locale redirect for /, plus the first-pass /admin guard
    ├── app/
    │   ├── (site)/[locale]/
    │   │   ├── layout.tsx     # <html lang dir>, per-locale fonts, generateMetadata
    │   │   ├── page.tsx       # reads the content store, composes all sections
    │   │   └── fonts.ts       # fontClassFor(locale) — only the active locale's faces
    │   ├── (admin)/admin/     # SECOND ROOT LAYOUT — own <html>, English/LTR, noindex
    │   │   ├── layout.tsx     # shares no provider with the public tree — §11
    │   │   ├── page.tsx       # login form
    │   │   ├── actions.ts     # login/logout + project CRUD + settings server actions
    │   │   ├── upload/actions.ts
    │   │   ├── dashboard/     # DashboardShell, ProjectRows, ProjectEditor,
    │   │   │                  # MediaGrid, SettingsForm
    │   │   └── ui/            # primitives.tsx, Toaster.tsx — the admin's vocabulary
    │   ├── api/media/[...key]/route.ts  # serves uploaded binaries, immutable cache
    │   ├── robots.ts          # allows the site, disallows /admin and /api/
    │   ├── providers.tsx      # ThemeProvider > I18nProvider > LazyMotion
    │   ├── no-flash.tsx       # inline pre-hydration script (theme + locale-cookie shim)
    │   └── globals.css        # design tokens, base styles, @font-face, component classes
    │
    ├── components/            # server-rendered sections + Icons.tsx, Reveal.tsx
    │   └── islands/           # the client components: switcher, toggle, drawer,
    │                          # ProjectsGrid, ContactForm, FloatingWhatsApp
    │
    ├── data/
    │   ├── projects.ts        # the TYPED FALLBACK catalogue — see §11 before editing
    │   └── blur.generated.ts  # AUTO-GENERATED — do not edit by hand
    │
    ├── i18n/
    │   ├── config.ts          # locales, dir, storage keys
    │   ├── locale.ts          # isLocale / negotiateLocale / dirFor / LOCALE_COOKIE
    │   ├── server.ts          # getT(locale) — the server-side counterpart to useI18n().t
    │   ├── I18nProvider.tsx   # context, t(), dot-path key typing
    │   └── dictionaries/{ar,en,fr}.ts
    │
    ├── lib/
    │   ├── site.ts            # contact details, WhatsApp, tech stack, skills, stats
    │   ├── content/           # types.ts (zod schemas), blobs.ts, index.ts (cached reads)
    │   ├── auth/              # password.ts, session.ts, rate-limit.ts
    │   └── images/            # process.ts (sniff + re-encode + LQIP), store.ts
    └── theme/ThemeProvider.tsx
```

---

## 5. Architecture & key decisions

**Localized routes, server-rendered i18n.** `/ar`, `/en` and `/fr` are three statically prerendered
paths under `(site)/[locale]`. `proxy.ts` redirects `/` to the best match. This is the keystone
decision: it gives crawlers per-language URLs and `hreflang`, lets the page render as server
components, and lets the server load one font family instead of three.

**Server first, islands second.** Everything renders on the server unless it needs interactivity or
a browser API. Sections take `locale` as a prop and resolve strings through `getT(locale)` from
`src/i18n/server.ts`. The client components live in `src/components/islands/` and are the only
things below `Providers` that ship JS: language switcher, theme toggle, mobile drawer, projects
grid, contact form, floating WhatsApp.

**Animation is rationed.** Scroll reveals are CSS plus an IntersectionObserver — no library at all.
The islands run under `LazyMotion features={domAnimation} strict`, importing `m` from
**`motion/react-m`** (see §16). Only the lightbox, loaded via `dynamic(..., { ssr: false })`, pulls
the full `domMax` feature set with drag and layout projection.

**No flash of wrong theme.** `NoFlashScript` (in `<head>`) reads `bc-theme` from `localStorage`
synchronously and sets `<html class="dark">` and `style.colorScheme` _before_ React hydrates; it
also migrates a v1 `bc-locale` value out of `localStorage` into a cookie. `lang` and `dir` are
server-rendered per route and never touched at runtime. Nothing React renders may branch on the
theme — see §16.

**Logical CSS properties everywhere.** Layout uses `start-*` / `end-*` / `ms-*` / `me-*` instead of
`left`/`right`, so RTL works without a mirrored stylesheet. Directional icons are flipped manually
with `dir === 'rtl' ? 'rotate-180' : ''`.

**Content comes from a store, with the bundled data as the fallback.** `page.tsx` awaits
`getProjects()` and `getSettings()` from `src/lib/content` and passes the results down. Both
reads are wrapped in `unstable_cache` and tagged `content`, so `/[locale]` stays statically
prerendered and an admin write invalidates it without a redeploy. Every read path falls back
to `src/data/projects.ts` / `src/lib/site.ts` — see §11.

**The admin is a second root layout, on purpose.** `src/app/(admin)/admin` owns its own
`<html>`, loads none of the public fonts, and shares no client provider with the public tree.
That is the mechanism keeping the dashboard off the public critical path, and
`tests/smoke.spec.ts` asserts it by fetching every script `/ar` loads and checking none of
them contains admin code.

**The lightbox is code-split.** `islands/ProjectsGrid.tsx` loads `ProjectGallery` via
`dynamic(..., { ssr: false })`, so the drag/gesture code only downloads when a visitor actually
opens a project. `AnimatePresence` lives in `ProjectsGrid`, not inside the gallery — presence has to
be tracked by whoever controls the mounting, or the exit animation never runs.

---

## 6. Internationalization (i18n)

**Files**

- `src/i18n/config.ts` — `LOCALES = ['ar','en','fr']`, `DEFAULT_LOCALE = 'ar'`, `LOCALE_META`
  (label, native name, `dir`, `htmlLang`), and the storage keys `bc-locale` / `bc-theme`.
- `src/i18n/dictionaries/en.ts` — **the source of truth for the shape.**
  `export type Dictionary = typeof en`, so `ar.ts` and `fr.ts` must structurally match it or
  TypeScript fails the build.
- `src/i18n/I18nProvider.tsx` — the context.

**Usage**

In a server component:

```tsx
const t = getT(locale); // src/i18n/server.ts
```

In a client island:

```tsx
const { t, locale, dir, dict, setLocale } = useI18n();

t('hero.badge'); // typed dot-path
t('gallery.counter', { current: 2, total: 5 }); // {placeholder} interpolation
```

`TKey` is a recursive mapped type over `Dictionary`, so `t('does.not.exist')` is a **compile error**.
At runtime an unresolved key falls back to returning the key string itself.

**Adding a language**

1. Add the code to `LOCALES` and an entry to `LOCALE_META` in `config.ts`.
2. Copy `dictionaries/en.ts` → `dictionaries/<code>.ts`, translate every value, register it in
   `dictionaries/index.ts`.
3. Add the code to the `locales` array inside `no-flash.tsx`'s migration shim, and give it a font
   in `src/app/(site)/[locale]/fonts.ts`.
4. Add the localized `title` / `description` for every project in `src/data/projects.ts`
   (`Record<Locale, string>` will demand it).

---

## 7. Theming & design system

**Two hand-designed palettes — not inverted values.** Tokens live in `src/app/globals.css` as
space-separated RGB channels so Tailwind's `<alpha-value>` syntax works (`text-fg/70`,
`bg-gold/20`).

| Token                       | Light                      | Dark                          |
| --------------------------- | -------------------------- | ----------------------------- |
| `--bg`                      | `248 249 252`              | `8 8 12` (OLED near-black)    |
| `--surface` / `--surface-2` | white / `241 243 249`      | `18 18 27` / `26 26 38`       |
| `--border`                  | `224 227 236`              | `42 42 58`                    |
| `--fg` / `--muted`          | `24 24 33` / `88 92 110`   | `240 241 248` / `158 160 178` |
| `--gold` (accent)           | `109 40 217` violet-700    | `167 139 250` violet-400      |
| `--brand-1/2/3`             | violet → indigo → cyan-700 | violet → blue → cyan          |

> **Naming gotcha:** the accent token is still called `--gold` / `gold` for backwards compatibility
> with existing utility classes. It resolves to **brand violet**, not gold. Don't be misled.

**Component classes** (`@layer components` in `globals.css`):
`.container-x` (page gutter), `.section-label`, `.gold-text` (gradient text clip), `.glass`
(blur + saturate surface), `.btn`, `.btn-gold` (fixed violet→indigo gradient, WCAG-safe white text
in both themes), `.btn-outline`, `.card-hover`. Utilities: `.no-scrollbar`, `.grain`.

**Fonts.** Latin routes load Playfair Display (`--font-display`) and Inter (`--font-sans`)
through `next/font/google`. **Arabic is self-hosted**: the six Tajawal faces live in
`public/fonts/` and are declared as `@font-face` rules in `globals.css`, with a
`'Tajawal Arabic Fallback'` family whose `size-adjust` and vertical overrides were measured
against Tajawal's own metrics. When `html[lang="ar"]`, both body and `.font-display` switch to
Tajawal — Playfair has no Arabic coverage.

The self-hosting is not a preference. `next/font` generates a fallback automatically and for
Tajawal it emits `src: local(Arial)` — and Arial has no Arabic glyphs, so Arabic text skipped
the adjusted face entirely and rendered in whatever system font existed, whose metrics the
adjustment was never computed for. Matching the real hero string needed `size-adjust: 143.30%`:
a 43% error on every Arabic page. `adjustFontFallback: false` does **not** suppress it on
Next 16 — verified against a clean build with `.next` and `node_modules/.cache` both removed.

One face — the weight the `<h1>` renders — is preloaded on `/ar` via `ReactDOM.preload`. Use
`ReactDOM.preload`, not a hand-written `<link>`: React hoists its own copy alongside a manual
one and the browser fetches the file twice.

**Theme switching:** `ThemeProvider` toggles `.dark` on `<html>` and sets `style.colorScheme`;
`darkMode: 'class'` in `tailwind.config.ts`. Body transitions `background-color`/`color` over 0.4s
(no transform transitions, to avoid jank).

---

## 8. Projects data & the gallery lightbox

### The data

The shape below is shared by both content paths (§11): the store validates against it with zod
in `src/lib/content/types.ts`, and **`src/data/projects.ts`** holds the bundled fallback in the
same shape.

```ts
interface Project {
  id: string; // must match the folder name in public/projects/
  title: Record<Locale, string>; // ar + en + fr, all required
  description: Record<Locale, string>;
  category: 'web' | 'app'; // drives the filter pills AND the lightbox layout
  frame?: 'phone' | 'browser'; // drives the CARD presentation (default: browser)
  cover: string; // "/projects/<id>/cover.jpg"
  images: string[]; // gallery images, in order
  link?: string; // live URL; omit or "" to hide the button
}
```

**`category` vs `frame` — two different switches, easy to confuse:**

- `category` filters the grid **and** decides the _lightbox_ layout:
  `app` → screenshot inside a device frame (9:19.5, notch); `web` → large `object-contain` image.
- `frame` only decides the _card_ cover presentation: `phone` → screenshot rising out of a gradient
  device mock; `browser` → edge-to-edge `object-cover`.

They can legitimately disagree — e.g. `pharmanet` and `skin-beauty` are `category: 'web'` with
`frame: 'phone'` (responsive web apps shot on a phone).

**The bundled catalogue** (order = display order). What a visitor sees comes from the store when
one is reachable; this is what renders when it is not:

| id                | Title                                    | Category / frame | Live                                        |
| ----------------- | ---------------------------------------- | ---------------- | ------------------------------------------- |
| `skin-beauty`     | Skin Beauty — Korean Skincare Store      | web / phone      | [link](https://skin-beauty-nine.vercel.app) |
| `ml-scores`       | ML Scores — Live Football App            | app / phone      | —                                           |
| `ecommerce`       | AURA — E-Commerce Platform               | web / browser    | —                                           |
| `swift-eats`      | Swift Eats — Food Delivery App           | app / phone      | —                                           |
| `pharmanet`       | PharmaNet — Pharmacy Management Platform | web / phone      | [link](https://phamanet.site.je)            |
| `presencia`       | PrésencIA — AI Attendance System         | web / browser    | —                                           |
| `pulse-analytics` | Pulse Analytics — SaaS Dashboard         | web / browser    | —                                           |

### The lightbox (`ProjectGallery.tsx`)

Opened by clicking a card. Features:

- **Navigation:** arrow buttons, thumbnail strip (auto-scrolls the active thumb into view), swipe
  (60px drag threshold), keyboard `←`/`→` — **direction-aware**, so in RTL `←` means _next_.
- **Close:** `Esc`, the close button, or clicking any empty scrim area.
- **Accessibility:** `role="dialog"`, `aria-modal`, `aria-labelledby`/`aria-describedby`, focus trap
  on `Tab`/`Shift+Tab`, focus moved to the close button on open, body scroll locked, `aria-live`
  counter, screen-reader hint.
- **Loading:** only the current image loads at full size; the immediate prev/next are preloaded via
  1px hidden `next/image`s. Every image uses its LQIP blur placeholder, shows a spinner until
  loaded, and gets an error state with a **Retry** button — never a bare black box.
- **Transitions:** framer-motion spring slides (`stiffness: 300, damping: 30`).

---

## 9. Images pipeline (blur placeholders & mockups)

### `scripts/gen-blur.mjs` — LQIP placeholders

Walks every raster file under `public/projects/**` (`.jpg .jpeg .png .webp .avif`), resizes to
20×20, encodes WebP q40, and writes a `publicPath → data:` map to
**`src/data/blur.generated.ts`** (auto-generated — never edit it by hand).

```ts
import { blurFor } from '@/data/blur.generated';
blurFor('/projects/pharmanet/1.jpeg'); // → "data:image/webp;base64,…" | undefined
```

Consumed by `Projects.tsx` and `ProjectGallery.tsx` as `placeholder="blur"` + `blurDataURL`.
Runs automatically on `npm run build` via `prebuild`. **Run `npm run gen:blur` after adding or
replacing any image**, otherwise the new image loads with no placeholder.

### `scripts/gen-mockups.mjs` + `scripts/photos.mjs` — synthetic demo screens

Some portfolio pieces (`swift-eats`, `ecommerce`, `pulse-analytics`) are **design showcases**, so
their screens are generated rather than screenshotted:

1. `scripts/mockups/<project>/*.svg` are hand-built UI templates containing
   `__PH_<token>__` placeholders inside `<image href>`.
2. `photos.mjs` resolves each token to **real photography** — TheMealDB (dish photos), Unsplash
   (free license), DummyJSON (product catalog shots) — and processes it with sharp
   (`cover` + attention crop, or `contain` on white for product shots).
3. `gen-mockups.mjs` substitutes the data-URIs into the SVG and rasterizes to WebP q80 at a
   per-project scale (`swift-eats` ×3, others ×2) into `public/projects/<project>/`.

```bash
node scripts/gen-mockups.mjs   # requires network access
npm run gen:blur               # then refresh the placeholders
```

Design intent: the mockups must read as a **real shipped product**, never as generic AI filler —
hence real photography baked into precise templates instead of stock placeholder blocks.

### `next.config.mjs` image settings

`formats: ['image/avif','image/webp']` and `qualities: [55, 70, 75, 78]` — Next 16 defaults
`qualities` to `[75]` and returns 400 for a direct image request at an unlisted quality, and
this project renders cards at 70, the lightbox stage at 78 and thumbnails at 55.

**`dangerouslyAllowSVG` is gone.** Earlier revisions of this file described it as enabled and
fenced; it is not in `next.config.mjs` and must not be reintroduced. SVG is a script container,
which is also why the admin's upload pipeline rejects SVG outright from its magic bytes rather
than from its filename or its claimed MIME type (§11).

---

## 10. Contact form (Netlify Forms)

Netlify detects forms by scanning **static HTML at deploy time**. The real form is rendered by
React, so Netlify can't see it. The fix is `public/__forms.html`: a hidden static form declaring
`name="contact"` with the exact same field names.

```
public/__forms.html          →  registers the "contact" form with Netlify
src/components/ContactForm.tsx →  POSTs urlencoded data to /__forms.html
```

Fields: `name`, `email`, `subject`, `message`, plus `form-name=contact` and the
`bot-field` honeypot. **If you add or rename a field, update both files** or submissions will be
rejected.

Client-side validation runs before submit (required name/email/message + email regex), focuses the
first invalid field, and renders localized errors with `role="alert"` and `aria-invalid`. Status
feedback (`sending` / `success` / `error`) is announced via `aria-live="polite"`.

Submissions appear in **Netlify → Forms → contact**. Email notifications:
**Site settings → Forms → Form notifications → Add notification**.

> **Local dev:** submissions only work on the deployed site (or under `netlify dev`).
> On `npm run dev`, `POST /__forms.html` will fail and the form will show its error state.
> That's expected.

---

## 11. Admin panel & the content store

`/admin` is a password-protected back office for the project catalogue and the site settings.
An edit made there appears on the public site **without a redeploy**.

### The two content paths

There are two, and both are supported on purpose:

| Path                                  | Use it for                                         | Mechanism                                                                       |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Admin panel** (normal)              | Adding, editing, reordering and deleting real work | Writes JSON to the `site-content` Netlify Blobs store, then invalidates the tag |
| **`src/data/projects.ts`** (fallback) | The typed default that ships in the bundle         | Rendered whenever the store is missing, cold, unreachable, or fails its schema  |

`src/data/projects.ts` and `src/lib/site.ts` are **not dead code and must never be deleted**.
They are what the site renders on a first deploy, during a Blobs outage, and in every local
test run. A store failure produces slightly stale content; an empty portfolio in front of a
client is the failure mode this design exists to prevent.

Both reads go through `src/lib/content/index.ts`, wrapped in `unstable_cache` and tagged
`content`. Writes call `updateTag`, **not** `revalidateTag` — on Next 16 `revalidateTag` with a
profile is stale-while-revalidate, so the next visitor would still be served the old content.

> **`unstable_cache` entries survive a deploy.** They live in `.next/cache`, which Netlify
> restores between builds, and a change to the _bundled fallback_ does not invalidate them. The
> cache keys therefore carry a `CACHE_VERSION` — bump it whenever the fallback data changes, or
> the new value will not appear. Runtime writes are unaffected.

### Running it locally

**Netlify Blobs only exists inside a Netlify runtime.**

```bash
npx netlify dev      # full CRUD locally, Blobs sandbox included
npm run dev          # reads only — fine for design and layout work
```

Under `npm run dev` or `next start` every read falls back to the bundled catalogue, so the
dashboard lists all 7 projects, and every write returns _"The content store is unavailable…"_.
That message is the expected behaviour, not a bug.

### Credentials

```bash
node scripts/gen-admin-secrets.mjs            # prompts with no echo
node scripts/gen-admin-secrets.mjs --random   # when there is no TTY, e.g. run through a tool
```

It writes `.env.admin.local` (gitignored, mode 0600) and prints nothing secret. Copy the two
lines into **Netlify → Site configuration → Environment variables**, and into `.env.local` for
local work. **The repository is public — no real value belongs in any committed file**,
`.env.example` included; that file lists names with empty values only.

> **`ADMIN_PASSWORD_HASH` holds the base64 of the argon2 hash, not the hash itself.** `@next/env`
> runs dotenv-expand over every `.env` file, and a hash is `$argon2id$v=19$m=…` — every `$name`
> expands to nothing. Plain, double-quoted, single-quoted and backslash-escaped forms are all
> mangled; there is no quoting that survives. Netlify's dashboard does no expansion, so a raw
> hash works in production while every local login fails. Both forms are accepted at runtime.

### Security model

- **argon2id** password verification that **fails closed**: an unset `ADMIN_PASSWORD_HASH` is
  not "no password required".
- **`jose` HS256 session**, 8h expiry, in an HttpOnly / Secure / SameSite=Strict cookie whose
  attributes are exported as one object so no future write can drift on them.
- **Rate limit**: 5 failures / 10 min / IP, 15 min lockout, Blobs-backed. Deliberately **fails
  open** — the password is the gate, and a Blobs outage locking the owner out of their own
  panel is a self-inflicted denial of service an attacker cannot trigger.
- **`proxy.ts` guards `/admin/*` as a first pass only.** Every server action re-verifies its own
  session. An action that trusts the proxy is an action with no auth.
- **Uploads are re-encoded, and that is the security step, not an optimisation.** The file type
  is sniffed from magic bytes — filename and client MIME are attacker-controlled — then sharp
  rebuilds the image from decoded pixels at four widths as WebP, which is what strips EXIF (a
  phone camera writes GPS coordinates into it) and neutralises anything appended to the
  original container. SVG is rejected.
- `/admin` carries `X-Robots-Tag: noindex, nofollow` from `next.config.mjs` **and** `robots`
  metadata **and** a `robots.txt` disallow.

---

## 12. SEO & metadata

- **Per-locale, server-rendered.** `src/app/(site)/[locale]/layout.tsx` exports
  `generateMetadata`, which resolves title, description, `canonical` and the `alternates.languages`
  map (`ar` / `en` / `fr` / `x-default`) from the route's own dictionary. The client-side
  `DocumentMeta` rewriter is gone.
- **Origin lives in one place:** `SITE_URL` in `src/lib/site.ts`, read from
  `NEXT_PUBLIC_SITE_URL` and defaulting to `https://medmoudsite.netlify.app`. Nothing else
  hardcodes an origin.
- **Viewport:** `themeColor` responds to `prefers-color-scheme` (`#f8f9fc` light / `#08080c` dark).

- **`src/app/robots.ts`** exists: allows the site, disallows `/admin` and `/api/`, and points at
  `${SITE_URL}/sitemap.xml`.

**Still missing** (plan 3, the remaining half of B13): Open Graph images per locale, JSON-LD, and
`sitemap.ts` — `robots.txt` already references a sitemap that is not generated yet.

**The SEO category is still unverified.** Netlify puts `X-Robots-Tag: noindex` on every deploy
preview, which is why Lighthouse scored SEO 66 there against the live site's 100. It has to be
re-measured on production after merge; nothing in the preview numbers can settle it.

---

## 13. Accessibility & performance

**Accessibility**

- Full RTL support via logical properties; `lang` and `dir` set before paint and kept in sync.
- Global `:focus-visible` ring using the accent token.
- Lightbox: dialog semantics, focus trap, scroll lock, live counter, keyboard + swipe parity.
- `aria-label` on every icon-only control; form errors wired with `aria-invalid` /
  `aria-describedby` / `role="alert"`.
- `prefers-reduced-motion: reduce` globally collapses animations and transitions to ~0ms and
  disables smooth scrolling; scroll reveals render visible immediately, guarded in both CSS and JS.
- **Works without JavaScript.** A `<noscript>` rule in the locale layout reveals `.reveal` and
  `[data-anim-in]`, so a visitor (or crawler) without JS sees the content instead of a blank page.
- The primary CTA gradient is fixed dark enough for WCAG-safe white text in **both** themes.

**Performance**

- Lightbox code-split (`next/dynamic`, `ssr: false`).
- `next/image` everywhere with explicit `sizes`, tuned `quality` (70 cards / 78 stage / 55 thumbs),
  AVIF+WebP output, LQIP blur placeholders.
- Only current + neighbouring gallery images are fetched — never the whole set.
- **Only the active locale's fonts load:** Tajawal for `/ar`, Playfair + Inter for `/en` and `/fr`
  (55.7 KB vs 84.8 KB, down from 111 KB on every route), all `font-display: swap`. `/ar` preloads
  exactly one face. **Not** `adjustFontFallback` — earlier revisions of this file credited it, and
  plan 2 task 2 proved it does not suppress the bad generated fallback on Next 16. The Arabic
  fallback is a hand-written, metric-matched `@font-face`; see §7.
- Scroll reveals are CSS + IntersectionObserver, disconnecting after the first intersection.
- Below-the-fold sections carry `content-visibility: auto` with measured
  `contain-intrinsic-size`, which also suspends the marquee animation while it is offscreen.
- Scroll listener is `{ passive: true }`.
- Measure, don't guess: `node scripts/measure-bundle.mjs http://localhost:3000/ar` and
  `node scripts/measure-cls.mjs`. Both start their own server and refuse to report a number
  against one they did not start. `measure-bundle` counts fonts by loading the page in a real
  browser rather than scanning the HTML — the Arabic faces are discovered through CSS, so a
  scan reported 0.0 KB while the page transferred 55.7 KB.

Current first-load JS is **237.3 KB gzipped** on every route, against a 150 KB target that has not
been met. 1.2 KB of that is the compression cost of the extra chunk boundary the admin's client
entrypoint introduces — no admin code reaches the public page, and `tests/smoke.spec.ts` asserts
it. Full accounting in `docs/superpowers/baseline/2026-07-27-after-plan-1.md` and `PROGRESS.md`.

---

## 14. Deployment

Netlify, configured by `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

plus `NODE_VERSION = "22.11.0"` — Next 16 needs 20.9+ and this site predates that.

### Where the headers live, and why the split is not tidy-able

**`netlify.toml` carries the cache rules only. The security headers live in `next.config.mjs`
`headers()`.** This looks like an inconsistency and is not: `netlify.toml` `[[headers]]` are
applied by the CDN to files it serves, and HTML documents come from the Next runtime's function,
which bypasses them entirely.

That was not a theory. Plan 1 declared the full set in `netlify.toml`, the config was correct,
and a deploy showed `/_next/static/*` carrying every header while `/ar` carried none of them
except the `nosniff` and HSTS Netlify adds by itself — for the entire life of the branch, with
nothing locally able to see it. Moving them back into `netlify.toml` silently disables them.

| Header set                                                  | Declared in       | Applies to        |
| ----------------------------------------------------------- | ----------------- | ----------------- |
| CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy     | `next.config.mjs` | every response    |
| `X-Robots-Tag: noindex` on `/admin/:path*`                  | `next.config.mjs` | the admin         |
| Immutable 1-year cache for `/_next/static/*`, `/projects/*` | `netlify.toml`    | CDN-served assets |

Local `next start` **does** apply `headers()`, so unlike plan 1 the CSP is locally checkable:

```bash
npm run build && npm start
curl -sI http://localhost:3000/ar | grep -iE "content-security-policy|referrer-policy|permissions-policy"
```

The immutable cache rules still need a deploy to verify:
`PLAYWRIGHT_BASE_URL=https://<preview>.netlify.app npm run test:headers`.

**Known loose directive: `script-src 'unsafe-inline'` on public routes.** A prerendered route
emits 22 inline scripts, 21 of them Next's own RSC flight payload, and a browser ignores
`'unsafe-inline'` the moment any hash or nonce is present — so hashing the no-flash script alone
blocks the other 21 and the page never hydrates. A nonce must be minted per request, which
forfeits the static prerendering the architecture exists to produce. Everything else in the
policy is strict. See `PROGRESS.md` for the three ways out and the current recommendation.

The CSP is environment-aware: development adds `'unsafe-eval'` (React's dev build and Turbopack's
HMR client both need it) and `ws:` (the HMR socket). Both are gated on `NODE_ENV` and neither can
reach a deployed response — Netlify builds with `NODE_ENV=production`, and the header suite
asserts `unsafe-eval` is absent from the delivered header.

The official Next.js runtime plugin handles `next/image` optimization, SSR, and routing.

1. Push to GitHub/GitLab/Bitbucket.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Settings are auto-detected from `netlify.toml`. Deploy.

### Environment variables

| Variable               | Required            | Notes                                                                       |
| ---------------------- | ------------------- | --------------------------------------------------------------------------- |
| `ADMIN_PASSWORD_HASH`  | For `/admin`        | Base64 of an argon2id hash. Netlify dashboard only — never a committed file |
| `AUTH_SECRET`          | For `/admin`        | 32 random bytes, base64. Signs the session JWT                              |
| `NEXT_PUBLIC_SITE_URL` | No                  | Defaults to `https://medmoudsite.netlify.app`. Set it when a domain lands   |
| `NODE_VERSION`         | Set in netlify.toml | `22.11.0`                                                                   |

Generate the two admin values with `node scripts/gen-admin-secrets.mjs` — see §11 for why the
hash is stored base64-encoded. **The repository is public; neither value may appear in a commit,
a PR description, a test fixture, or `.env.example`.**

Because `prebuild` runs `gen:blur`, `sharp` must remain in `dependencies` (not `devDependencies`)
for the Netlify build to succeed.

---

## 15. Common tasks / cookbook

Content has **two paths** since the admin panel landed (§11). Pick by intent: the admin for
real content, the bundled files for the typed default that ships in the build.

**Add a project — the normal way**

1. Sign in at `/admin`, open the dashboard, **Add project**.
2. Fill the id, the three locales, category and frame, and drag the images into the Media
   drop zone. Paths are never typed — the uploader produces them.
3. Save. The public site picks it up without a redeploy.

Uploads are re-encoded to WebP at four widths and get their LQIP generated at upload time, so
`gen:blur` is **not** part of this path.

**Add a project — to the bundled fallback**

Only when the entry should exist with no store at all: on a first deploy, during a Blobs
outage, and in every local test run.

1. `mkdir public/projects/<id>` and drop the images in (`cover.jpg`, `1.jpg`, `2.jpg`, …).
2. Append an entry to `projects` in `src/data/projects.ts` — all three languages for
   `title`/`description`, plus `category`, `frame`, `cover`, `images`, optional `link`.
3. `npm run gen:blur`.
4. **Bump `CACHE_VERSION` in `src/lib/content/index.ts`.** `unstable_cache` entries live in
   `.next/cache`, which Netlify restores between builds, and a change to the bundled fallback
   does not invalidate them on its own.
5. `npm run dev` and verify the card, the filter pills, and the lightbox.

**Reorder projects** — drag the rows in the admin, or use the row's move buttons. Order in the
stored array is display order, exactly as it is in the bundled catalogue.

**Change contact details** — WhatsApp number, social links, hero stats and the availability
badge are all in the admin's **Settings**. The `wa.me` URL is derived from the number and shown
read-only, so the two cannot drift. `src/lib/site.ts` holds the same values as the bundled
fallback (`email`, `whatsappNumber`, `yearsExperience`, `projectsDelivered`, `stacksCount`); the
email is not managed from the admin and still lives in `Contact.tsx` / `Footer.tsx`.

**Change the tech marquee or skills** — `TECH_STACK` and `SKILLS` in `src/lib/site.ts`.

**Change any visible copy** — `src/i18n/dictionaries/{ar,en,fr}.ts`. Keep the three files
structurally identical or the build fails.

**Recolor the site** — edit the token blocks in `src/app/globals.css` (`:root` and `:root.dark`)
and the fixed hex stops in `.btn-gold`. Don't rename `--gold`; many utilities depend on it.

**Change the default language or theme** — `DEFAULT_LOCALE` in `src/i18n/config.ts` is the proxy's
fallback for a visitor whose `Accept-Language` matches nothing. The theme default must agree
between `src/app/no-flash.tsx` and `ThemeProvider`'s SSR value.

**Run the tests** — `npm run test:e2e` (148 pass, 14 skipped locally; the skips are the
deploy-only header assertions). Several tests are marked **PROTECTED** in `tests/smoke.spec.ts`
and `tests/headers.spec.ts` and must not be weakened — each exists because a real regression
passed a weaker check: computed `font-family` per locale, computed `opacity > 0` per section,
the hero and cards visible with JavaScript disabled, CLS under a throttled font swap, headers
asserted on a delivered response, and no admin code in any script the public page loads.

**Change the admin password** — rerun `node scripts/gen-admin-secrets.mjs`, then replace
`ADMIN_PASSWORD_HASH` in Netlify. Rotating `AUTH_SECRET` at the same time invalidates every
existing session, which is what you want if the old password may have leaked.

---

## 16. Gotchas

- **`src/data/blur.generated.ts` is generated.** Edits are overwritten by the next build.
- **Security headers belong in `next.config.mjs`, never in `netlify.toml`.** The toml ones never
  reach an HTML document. See §14 — this shipped undetected for a whole branch.
- **`src/data/projects.ts` and `src/lib/site.ts` are the live fallback, not legacy files.** The
  site renders them whenever the store is missing, cold or unreachable. Deleting them turns a
  Blobs outage into an empty portfolio.
- **Bump `CACHE_VERSION` when the bundled fallback changes.** `unstable_cache` entries persist in
  `.next/cache`, which Netlify restores between builds, so the old value survives the deploy.
- **`ADMIN_PASSWORD_HASH` is stored base64.** dotenv-expand eats every `$` in an argon2 hash and
  no quoting survives it. Netlify does no expansion, so a raw hash works in production while
  every local login fails — the worst possible split. See §11.
- **The accent is named `gold` but is violet.** Historical naming, kept for compatibility.
- **`category` ≠ `frame`.** `category` drives filtering + lightbox layout; `frame` drives only the
  card cover. See §8.
- **The theme default must stay in sync** between `no-flash.tsx` and `ThemeProvider`'s SSR value.
  A mismatch causes a visible flash on first paint. The locale is no longer part of this: it comes
  from the route, and `DEFAULT_LOCALE` is only the proxy's fallback.
- **`__forms.html` field names must mirror `ContactForm.tsx`** or Netlify rejects submissions.
- **The contact form cannot work on `npm run dev`** — Netlify Forms is a deploy-time feature.
- **`gen-mockups.mjs` needs network access** and will throw on an unknown `__PH_<token>__` or a
  missing `width`/`height` on the template's `<svg>` element.
- **Dictionaries are structurally typed against `en.ts`.** A missing key in `ar.ts`/`fr.ts` is a
  build failure, not a silent fallback.
- **Never render anything that branches on the current theme.** The server cannot know which theme
  a visitor stored, so any theme-dependent markup either mismatches on hydration (React error #418,
  which throws away the server HTML) or is wrong for a frame. Both were shipped and both were bugs.
  Use the `dark:` variant and let CSS choose — see `islands/ThemeToggle.tsx`.
- **Import `m` from `motion/react-m`, never from `motion/react`.** The `motion/react` barrel also
  exports the full `motion` proxy, so importing `m` from it keeps every feature and _increases_ the
  bundle — measured at +2.4 KB versus doing nothing. Only `import * as m from 'motion/react-m'`
  actually tree-shakes.
- **Tailwind purges `@layer components` rules whose class name it cannot find in a scanned file.**
  Keep class names as plain, unbroken literals; interpolating right after the name
  (`` `reveal${x}` ``) silently deletes the rule. This has already happened once.
- **Measurement scripts kill whatever is listening on their port.** An orphaned `next start` from a
  crashed session serves an old build and produces a flattering, wrong number — this happened three
  times before the guard existed.

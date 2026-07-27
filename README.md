# Mauri-Dev — Portfolio Website

A premium, single-page, multilingual (Arabic / English / French) portfolio and marketing site for
**Mauri-Dev** — the brand of **Bay Cheikh (Med Moud)**, Full Stack & Mobile App Developer.

Built with **Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS 3 · Framer Motion**,
deployed on **Netlify**.

- **Live:** https://medmaoudsite.netlify.app
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
11. [SEO & metadata](#11-seo--metadata)
12. [Accessibility & performance](#12-accessibility--performance)
13. [Deployment](#13-deployment)
14. [Common tasks / cookbook](#14-common-tasks--cookbook)
15. [Gotchas](#15-gotchas)

---

## 1. What this project is

A **single-page** portfolio site (no routing — everything lives on `/` and navigates via anchors).
Its purpose is to convert visitors into clients: show credibility, show real work, and give one-tap
access to WhatsApp / email / contact form.

Page sections, in render order (`src/app/page.tsx`):

| Order | Component | Anchor | Purpose |
|-------|-----------|--------|---------|
| 1 | `Header` | — | Fixed nav, language switcher, theme toggle, WhatsApp CTA, mobile drawer |
| 2 | `Hero` | `#top` | Headline, availability badge, CTAs, stats (5+ yrs / 120+ projects / 10+ stacks) |
| 3 | `TechMarquee` | — | Infinite-scrolling tech logos strip (RTL-aware) |
| 4 | `About` | `#about` | Bio, skills grouped by Languages / Frameworks / Mobile, 3 highlight cards |
| 5 | `Projects` | `#projects` | Filterable project grid (All / Web / App) + lightbox gallery |
| 6 | `Process` | `#process` | 4-step method: Discover → Design → Build → Launch |
| 7 | `Contact` | `#contact` | Contact form + WhatsApp + email cards |
| 8 | `Footer` | — | Nav, connect links, copyright |
| 9 | `FloatingWhatsApp` | — | Persistent floating WhatsApp button |

Plus `DocumentMeta` (headless — keeps `<title>`/`<meta description>` in sync with the active language).

**Defaults:** language **Arabic (RTL)**, theme **dark** (falls back to `prefers-color-scheme`).
Both are persisted to `localStorage` and applied *before first paint* by an inline no-flash script.

---

## 2. Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script | What it does |
|--------|--------------|
| `npm run dev` | Next dev server |
| `npm run build` | Runs `prebuild` (`gen:blur`) then `next build` |
| `npm start` | Serves the production build |
| `npm run lint` | `next lint` (eslint-config-next / core-web-vitals) |
| `npm run gen:blur` | Regenerates LQIP blur placeholders → `src/data/blur.generated.ts` |
| `node scripts/gen-mockups.mjs` | Rebuilds the synthetic mockup screens (network required — see §9) |

> `prebuild` is wired into `build`, so blur placeholders are always regenerated on deploy.
> `sharp` is a **runtime dependency** (not devDependency) for exactly this reason.

Node 18+ recommended (the scripts use top-level `await` and global `fetch`).

---

## 3. Tech stack

**Runtime deps**

| Package | Version | Used for |
|---------|---------|----------|
| `next` | 14.2.5 | App Router, `next/image`, `next/font` |
| `react` / `react-dom` | ^18.3.1 | UI |
| `framer-motion` | ^11.3.24 | Scroll reveals, lightbox slides/drag, layout animations |
| `sharp` | ^0.35.3 | Build-time image processing (blur LQIP + mockup rasterization) |

**Dev deps:** TypeScript 5.5 (strict), Tailwind 3.4, PostCSS + Autoprefixer, ESLint 8 + `eslint-config-next`.

**Notably absent by design:** no i18n library, no state manager, no UI kit, no icon package
(icons are hand-written inline SVGs in `src/components/Icons.tsx`), no CMS. Everything is local
and type-safe, which keeps the bundle small and the site fully static-friendly.

Path alias: `@/*` → `./src/*` (see `tsconfig.json`).

---

## 4. Repository layout

```
.
├── netlify.toml               # Netlify build config + @netlify/plugin-nextjs
├── next.config.mjs            # strict mode, image formats (avif/webp), SVG policy
├── tailwind.config.ts         # design tokens mapped to CSS vars, keyframes
├── postcss.config.mjs
├── tsconfig.json              # strict TS, "@/*" alias
│
├── public/
│   ├── mauri-dev.jpeg         # brand/profile image
│   ├── __forms.html           # hidden static form so Netlify can detect the React form
│   └── projects/<id>/…        # real project screenshots (jpg / jpeg / png / webp)
│
├── scripts/
│   ├── gen-blur.mjs           # walks public/projects/** → base64 LQIP map
│   ├── gen-mockups.mjs        # SVG templates + real photos → high-res WebP screens
│   ├── photos.mjs             # named photo tokens → fetched & processed JPEG buffers
│   └── mockups/<project>/*.svg# mockup screen templates (__PH_<token>__ placeholders)
│
└── src/
    ├── app/
    │   ├── layout.tsx         # fonts, default (Arabic) metadata, viewport, providers
    │   ├── page.tsx           # the single page — composes all sections
    │   ├── providers.tsx      # ThemeProvider > I18nProvider
    │   ├── no-flash.tsx       # inline pre-hydration script (theme + lang/dir)
    │   └── globals.css        # design tokens, base styles, component classes
    │
    ├── components/            # all UI (see §1 table) + Icons.tsx, Reveal.tsx
    │
    ├── data/
    │   ├── projects.ts        # ← THE project catalog (edit this to add work)
    │   └── blur.generated.ts  # AUTO-GENERATED — do not edit by hand
    │
    ├── i18n/
    │   ├── config.ts          # locales, dir, storage keys
    │   ├── I18nProvider.tsx   # context, t(), dot-path key typing
    │   └── dictionaries/{ar,en,fr}.ts
    │
    ├── lib/site.ts            # contact details, WhatsApp, tech stack, skills
    └── theme/ThemeProvider.tsx
```

---

## 5. Architecture & key decisions

**Single route, client-side i18n.** There is no `/en`, `/fr`, `/ar` route segmentation. The whole
site is one route; language is React context + `localStorage`. Trade-off: simpler, zero duplicate
pages, instant switching — at the cost of not having per-language URLs for crawlers. Server-rendered
metadata is Arabic (the default); `DocumentMeta` refines `<title>`/`<description>` client-side once a
visitor picks a language.

**Providers order** (`src/app/providers.tsx`): `ThemeProvider` wraps `I18nProvider`. Both are
client components; everything below them is client-side too (they all need `useI18n`).

**No flash of wrong theme/direction.** `NoFlashScript` (in `<head>`) reads `bc-theme` and
`bc-locale` from `localStorage` synchronously and sets `<html class="dark">`, `style.colorScheme`,
`lang`, and `dir` *before* React hydrates. `<html>` carries `suppressHydrationWarning` because of
this. The default in the script (dark, `ar`, `rtl`) must stay in sync with `DEFAULT_LOCALE` and
`ThemeProvider`'s initial state.

**Logical CSS properties everywhere.** Layout uses `start-*` / `end-*` / `ms-*` / `me-*` instead of
`left`/`right`, so RTL works without a mirrored stylesheet. Directional icons are flipped manually
with `dir === 'rtl' ? 'rotate-180' : ''`.

**The lightbox is code-split.** `Projects.tsx` loads `ProjectGallery` via
`dynamic(..., { ssr: false })`, so framer-motion's drag/gesture code only downloads when a visitor
actually opens a project.

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

```tsx
const { t, locale, dir, dict, ready, setLocale } = useI18n();

t('hero.badge')                                  // typed dot-path
t('gallery.counter', { current: 2, total: 5 })   // {placeholder} interpolation
```

`TKey` is a recursive mapped type over `Dictionary`, so `t('does.not.exist')` is a **compile error**.
At runtime an unresolved key falls back to returning the key string itself.

**Adding a language**

1. Add the code to `LOCALES` and an entry to `LOCALE_META` in `config.ts`.
2. Copy `dictionaries/en.ts` → `dictionaries/<code>.ts`, translate every value, register it in
   `dictionaries/index.ts`.
3. Add the code to the `locales` array inside `no-flash.tsx` (and to the `dir` ternary if RTL).
4. Add the localized `title` / `description` for every project in `src/data/projects.ts`
   (`Record<Locale, string>` will demand it).

---

## 7. Theming & design system

**Two hand-designed palettes — not inverted values.** Tokens live in `src/app/globals.css` as
space-separated RGB channels so Tailwind's `<alpha-value>` syntax works (`text-fg/70`,
`bg-gold/20`).

| Token | Light | Dark |
|-------|-------|------|
| `--bg` | `248 249 252` | `8 8 12` (OLED near-black) |
| `--surface` / `--surface-2` | white / `241 243 249` | `18 18 27` / `26 26 38` |
| `--border` | `224 227 236` | `42 42 58` |
| `--fg` / `--muted` | `24 24 33` / `88 92 110` | `240 241 248` / `158 160 178` |
| `--gold` (accent) | `109 40 217` violet-700 | `167 139 250` violet-400 |
| `--brand-1/2/3` | violet → indigo → cyan-700 | violet → blue → cyan |

> **Naming gotcha:** the accent token is still called `--gold` / `gold` for backwards compatibility
> with existing utility classes. It resolves to **brand violet**, not gold. Don't be misled.

**Component classes** (`@layer components` in `globals.css`):
`.container-x` (page gutter), `.section-label`, `.gold-text` (gradient text clip), `.glass`
(blur + saturate surface), `.btn`, `.btn-gold` (fixed violet→indigo gradient, WCAG-safe white text
in both themes), `.btn-outline`, `.card-hover`. Utilities: `.no-scrollbar`, `.grain`.

**Fonts** (`next/font/google`, in `layout.tsx`): Playfair Display (`--font-display`),
Inter (`--font-sans`), Tajawal (`--font-arabic`). When `html[lang="ar"]`, both body and
`.font-display` switch to Tajawal — Playfair has no Arabic coverage.

**Theme switching:** `ThemeProvider` toggles `.dark` on `<html>` and sets `style.colorScheme`;
`darkMode: 'class'` in `tailwind.config.ts`. Body transitions `background-color`/`color` over 0.4s
(no transform transitions, to avoid jank).

---

## 8. Projects data & the gallery lightbox

### The data

Everything lives in **`src/data/projects.ts`**:

```ts
interface Project {
  id: string;                          // must match the folder name in public/projects/
  title: Record<Locale, string>;       // ar + en + fr, all required
  description: Record<Locale, string>;
  category: 'web' | 'app';             // drives the filter pills AND the lightbox layout
  frame?: 'phone' | 'browser';         // drives the CARD presentation (default: browser)
  cover: string;                       // "/projects/<id>/cover.jpg"
  images: string[];                    // gallery images, in order
  link?: string;                       // live URL; omit or "" to hide the button
}
```

**`category` vs `frame` — two different switches, easy to confuse:**

- `category` filters the grid **and** decides the *lightbox* layout:
  `app` → screenshot inside a device frame (9:19.5, notch); `web` → large `object-contain` image.
- `frame` only decides the *card* cover presentation: `phone` → screenshot rising out of a gradient
  device mock; `browser` → edge-to-edge `object-cover`.

They can legitimately disagree — e.g. `pharmanet` and `skin-beauty` are `category: 'web'` with
`frame: 'phone'` (responsive web apps shot on a phone).

**Current catalog** (order = display order):

| id | Title | Category / frame | Live |
|----|-------|------------------|------|
| `skin-beauty` | Skin Beauty — Korean Skincare Store | web / phone | [link](https://skin-beauty-nine.vercel.app) |
| `ml-scores` | ML Scores — Live Football App | app / phone | — |
| `ecommerce` | AURA — E-Commerce Platform | web / browser | — |
| `swift-eats` | Swift Eats — Food Delivery App | app / phone | — |
| `pharmanet` | PharmaNet — Pharmacy Management Platform | web / phone | [link](https://phamanet.site.je) |
| `presencia` | PrésencIA — AI Attendance System | web / browser | — |
| `pulse-analytics` | Pulse Analytics — SaaS Dashboard | web / browser | — |

### The lightbox (`ProjectGallery.tsx`)

Opened by clicking a card. Features:

- **Navigation:** arrow buttons, thumbnail strip (auto-scrolls the active thumb into view), swipe
  (60px drag threshold), keyboard `←`/`→` — **direction-aware**, so in RTL `←` means *next*.
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

`formats: ['image/avif','image/webp']`. `dangerouslyAllowSVG` is enabled (legacy — from when SVG
placeholders shipped in `public/projects`) and is fenced with
`contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"` plus
`contentDispositionType: 'attachment'`. If you ever serve **untrusted** SVGs, turn this off.

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

## 11. SEO & metadata

- **Server-side (crawlers):** `src/app/layout.tsx` exports Arabic-default `metadata` —
  title template `%s — Mauri-Dev`, description, keywords (both Latin and Arabic: `Mauri-Dev`,
  `Bay Cheikh`, `Med Moud`, `مطور ويب`, …), `authors`, `alternates.languages`, Open Graph, Twitter
  card. `metadataBase` = `https://baycheikh.netlify.app`.
- **Client-side:** `DocumentMeta.tsx` rewrites `document.title` and the description meta from
  `dict.meta` whenever the locale changes.
- **Viewport:** `themeColor` responds to `prefers-color-scheme` (`#f8f9fc` light / `#08080c` dark).

If you change the deployed domain, update `SITE_URL` in `layout.tsx`.

---

## 12. Accessibility & performance

**Accessibility**

- Full RTL support via logical properties; `lang` and `dir` set before paint and kept in sync.
- Global `:focus-visible` ring using the accent token.
- Lightbox: dialog semantics, focus trap, scroll lock, live counter, keyboard + swipe parity.
- `aria-label` on every icon-only control; form errors wired with `aria-invalid` /
  `aria-describedby` / `role="alert"`.
- `prefers-reduced-motion: reduce` globally collapses animations and transitions to ~0ms and
  disables smooth scrolling.
- The primary CTA gradient is fixed dark enough for WCAG-safe white text in **both** themes.

**Performance**

- Lightbox code-split (`next/dynamic`, `ssr: false`).
- `next/image` everywhere with explicit `sizes`, tuned `quality` (70 cards / 78 stage / 55 thumbs),
  AVIF+WebP output, LQIP blur placeholders.
- Only current + neighbouring gallery images are fetched — never the whole set.
- Fonts via `next/font` with `display: 'swap'` and subsetting (latin / arabic).
- Scroll listener is `{ passive: true }`; reveal animations use `viewport={{ once: true }}`.

---

## 13. Deployment

Netlify, configured by `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

The official Next.js runtime plugin handles `next/image` optimization, SSR, and routing.

1. Push to GitHub/GitLab/Bitbucket.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Settings are auto-detected from `netlify.toml`. Deploy.

No environment variables are required. Because `prebuild` runs `gen:blur`, `sharp` must remain in
`dependencies` (not `devDependencies`) for the Netlify build to succeed.

---

## 14. Common tasks / cookbook

**Add a project**

1. `mkdir public/projects/<id>` and drop the images in (`cover.jpg`, `1.jpg`, `2.jpg`, …).
2. Append an entry to `projects` in `src/data/projects.ts` — all three languages for
   `title`/`description`, plus `category`, `frame`, `cover`, `images`, optional `link`.
3. `npm run gen:blur`.
4. `npm run dev` and verify the card, the filter pills, and the lightbox.

**Reorder projects** — reorder the array in `src/data/projects.ts`. That's the whole mechanism.

**Change contact details** — `src/lib/site.ts` (`email`, `whatsappNumber`, `whatsappUrl`,
`yearsExperience`, `projectsDelivered`). Update `whatsappNumber` and `whatsappUrl` together.
The stats in the hero read from this file. The email also appears in `Contact.tsx`/`Footer.tsx`.

**Change the tech marquee or skills** — `TECH_STACK` and `SKILLS` in `src/lib/site.ts`.

**Change any visible copy** — `src/i18n/dictionaries/{ar,en,fr}.ts`. Keep the three files
structurally identical or the build fails.

**Recolor the site** — edit the token blocks in `src/app/globals.css` (`:root` and `:root.dark`)
and the fixed hex stops in `.btn-gold`. Don't rename `--gold`; many utilities depend on it.

**Change the default language or theme** — `DEFAULT_LOCALE` in `src/i18n/config.ts`,
`ThemeProvider`'s initial state, **and** the matching defaults inside `src/app/no-flash.tsx`.
All three must agree.

---

## 15. Gotchas

- **`src/data/blur.generated.ts` is generated.** Edits are overwritten by the next build.
- **The accent is named `gold` but is violet.** Historical naming, kept for compatibility.
- **`category` ≠ `frame`.** `category` drives filtering + lightbox layout; `frame` drives only the
  card cover. See §8.
- **Three defaults must stay in sync:** `no-flash.tsx`, `config.ts` (`DEFAULT_LOCALE`), and
  `ThemeProvider`. A mismatch causes a visible flash on first paint.
- **`__forms.html` field names must mirror `ContactForm.tsx`** or Netlify rejects submissions.
- **The contact form cannot work on `npm run dev`** — Netlify Forms is a deploy-time feature.
- **`gen-mockups.mjs` needs network access** and will throw on an unknown `__PH_<token>__` or a
  missing `width`/`height` on the template's `<svg>` element.
- **Dictionaries are structurally typed against `en.ts`.** A missing key in `ar.ts`/`fr.ts` is a
  build failure, not a silent fallback.
- **The site is one route.** There are no per-language URLs; server-rendered metadata is Arabic.

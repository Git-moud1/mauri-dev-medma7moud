# Bay Cheikh — Portfolio Website

A premium, multilingual (Arabic / English / French) marketing & portfolio site for
**Bay Cheikh (Med Moud)** — Full Stack & Mobile App Developer.

Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Framer Motion**.

## ✨ Features

- **3 languages** — Arabic (default, full RTL), English, French. All content is translated,
  including project titles & descriptions. The choice is persisted in `localStorage` and the
  page `dir`/`lang` switch automatically.
- **Dark / Light mode** — designed as two distinct palettes (not inverted), smooth transition,
  persisted in `localStorage`, with a no-flash inline script.
- **Project image gallery (lightbox)** — click any project card to open an in-site gallery with:
  - Next / Previous arrows, dot indicators, and an image counter
  - **Swipe** on mobile and **keyboard** on desktop (← → to navigate, direction-aware for RTL; **Esc** to close)
  - Project title + short description inside the gallery
  - Smooth spring transitions, `next/image` optimized loading, focus trap & scrim
- **WhatsApp** — header CTA, floating button, contact card, and footer link → `https://wa.me/22231317501`
- **Netlify-ready contact form** + direct email (`baymed000@gmail.com`)
- Responsive & mobile-first, accessible (focus states, aria-labels, reduced-motion), per-language SEO.
- Extra polish: animated hero, tech marquee, stats, and a step-by-step process section.

## 🚀 Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

```bash
npm run build   # production build
npm start       # serve the production build
```

## 🖼️ Adding real project images & data

All project data lives in **`src/data/projects.ts`**. For each project:

1. Put the images in **`public/projects/<project-id>/`** (e.g. `cover.jpg`, `1.jpg`, `2.jpg`).
2. Update the `cover` and `images` paths and set the localized `title` / `description`
   (for `ar`, `en`, `fr`), the `category` (`"web"` or `"app"`), and an optional `link`.

```ts
{
  id: "project-1",
  title: { ar: "…", en: "…", fr: "…" },
  description: { ar: "…", en: "…", fr: "…" },
  category: "web",           // "web" | "app"
  cover: "/projects/project-1/cover.jpg",
  images: ["/projects/project-1/1.jpg", "/projects/project-1/2.jpg"], // 1–2 images
  link: "",                  // optional live URL
}
```

Lightweight **SVG placeholders** ship in `public/projects/*` so the site renders before the
real images arrive — just replace them.

> Translations for UI text live in `src/i18n/dictionaries/{ar,en,fr}.ts`.

## 🌐 Deploy to Netlify

1. Push this project to a Git repository (GitHub/GitLab/Bitbucket).
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Netlify auto-detects settings from `netlify.toml`:
   - Build command: `npm run build`
   - The official **`@netlify/plugin-nextjs`** runtime is enabled (handles `next/image`, SSR & routing).
4. Deploy.

### Contact form on Netlify

Netlify Forms are enabled via **`public/__forms.html`** — a hidden static form Netlify scans
at deploy time to register the `contact` form. The React form (`src/components/ContactForm.tsx`)
submits to it with matching field names.

After the first deploy, submissions appear under **Netlify → Forms → contact**.
To get email notifications: **Site settings → Forms → Form notifications → Add notification**.

> Local dev note: form submissions only work on the deployed Netlify site (or via
> `netlify dev`), not on `npm run dev`.

## 🎨 Customization quick reference

| What | Where |
|------|-------|
| Colors / theme tokens | `src/app/globals.css` (`:root` and `:root.dark`) |
| Fonts | `src/app/layout.tsx` (`next/font`) |
| Contact details, WhatsApp number, skills | `src/lib/site.ts` |
| Projects | `src/data/projects.ts` + `public/projects/` |
| Translations | `src/i18n/dictionaries/*` |

## 🧱 Tech stack

Next.js 14 · React 18 · TypeScript · Tailwind CSS 3 · Framer Motion · next/image

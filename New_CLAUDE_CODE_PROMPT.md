# Mauri-Dev Portfolio — Upgrade & Rebuild Brief

## Phase 1- Tab Icon
The site's logo, which appears within the site and is called Mauri-Dev, was placed as the site's favicon(Website Icon)

## Phase 2 — SEO

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

## Phase 3 — Security & code quality

- **Security headers** (in `netlify.toml` or Next's `headers()`): a real Content-Security-Policy (nonce-based — the `no-flash` inline script needs a nonce or hash), HSTS with preload, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera/mic/geolocation, `frame-ancestors 'none'`.
- No secret ever reaches the client bundle. Grep for `NEXT_PUBLIC_` and audit every hit.
- Server Actions: verify session + validate with zod inside every action; rely on SameSite=Strict plus Next's origin checks for CSRF.
- No `dangerouslySetInnerHTML` anywhere except the audited no-flash script.
- Contact form: keep the honeypot, add server-side rate limiting, and validate on the server as well as the client.
- `npm audit` clean (or documented and justified); no unmaintained or unused dependencies.
- **Fix every existing bug you find.** Read the code critically: memory leaks from uncleaned listeners/observers, stale closures, missing `key`s, race conditions in the lightbox preloader, focus-trap edge cases, `localStorage` access without a try/catch (private mode throws), the RTL keyboard-direction logic, error states with no recovery path.
- Tighten the toolchain: TypeScript strict with `noUncheckedIndexedAccess`, ESLint flat config with `typescript-eslint` strict + `jsx-a11y`, Prettier. Zero warnings.
- Add a light safety net: Playwright smoke tests covering page load in all three locales, opening the lightbox, submitting the contact form, and the full admin login → create project → verify on the public page flow. Plus an axe accessibility check.

## Definition of done

- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.
- Deployed preview on Netlify works in all three languages, both themes, on a real phone.
- Lighthouse mobile: Performance ≥ 95, Accessibility ≥ 95, Best Practices ≥ 95, SEO 100. Before/after numbers in `MIGRATION.md`.
-Everything works on pc have to work on phone i mean the website look must be good on phone like pc because clients often has just phone so check on that.  
- Admin panel: log in, add a project with images in three languages, reorder it, edit the WhatsApp number, add social links, delete a project — all visible on the public site **without a redeploy**,and with perfect design for admin .
- Hero looks like premium bespoke work and doesn't cost more than its budget.
-Delete all file that you used for test or something doesn't matter use /simplify and /verify to clean project and check all of things it's okay .
- README and `MIGRATION.md` updated, with the exact list of env vars to set in Netlify.
-check it pushed on GitHub main  then deployment on  netlify and website work well.
-Be sure about the SEO .
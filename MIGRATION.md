# MIGRATION — v1 → v2, plan 1 (foundation)

What changed, what it cost, what is still open. Every number here was measured;
where a target was missed it is stated as missed.

- **Branch:** `feat/v2` (PR #1, not merged)
- **Preview:** https://deploy-preview-1--medmoudsite.netlify.app
- **Live (v1, the baseline):** https://medmoudsite.netlify.app
- **Measured:** 2026-07-28, Lighthouse 13.4.1 mobile / simulated throttling,
  and a Pixel 7 profile (412×915, DPR 2.625) for the network probes.

---

## 1. What changed

| Area       | v1                                                                   | v2                                                                                                                                           |
| ---------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next 14, React 18                                                    | **Next 16 (Turbopack), React 19**                                                                                                            |
| Animation  | `framer-motion`, full bundle                                         | `motion`, `LazyMotion domAnimation` for islands; `domMax` only inside the code-split lightbox; scroll reveals are CSS + IntersectionObserver |
| Routing    | one route, anchors                                                   | **`/ar`, `/en`, `/fr`**, statically prerendered; `/` 307s to the best match (cookie → `Accept-Language` → Arabic)                            |
| i18n       | React context + `localStorage`, whole tree client-side               | route-driven, server-rendered; islands only                                                                                                  |
| Metadata   | Arabic-only server metadata, rewritten client-side by `DocumentMeta` | `generateMetadata` per locale, with `canonical` and `hreflang`; `DocumentMeta` deleted                                                       |
| Fonts      | 3 families, 5 faces preloaded on every route                         | only the active locale's faces                                                                                                               |
| Middleware | `middleware.ts`                                                      | `proxy.ts` (Next 16 convention)                                                                                                              |
| Toolchain  | TS strict, ESLint 8                                                  | TS strict + `noUncheckedIndexedAccess`, ESLint 9 flat with `typescript-eslint` strictTypeChecked + jsx-a11y, Prettier, Playwright            |
| Tests      | none                                                                 | 72 Playwright assertions across 3 locales and 2 device profiles                                                                              |

Bugs closed: **B1–B12, B14, B15, B18**, plus two found during the work — a
blank page for visitors without JavaScript, and a hydration mismatch introduced
by the plan's own prescribed fix for B4.

---

## 2. Performance: the honest before/after

### Lighthouse, mobile

|                | v1 live `/` | v2 preview `/ar` | v2 preview `/en` |
| -------------- | ----------- | ---------------- | ---------------- |
| Performance    | 96          | **96**           | **95**           |
| Accessibility  | 100         | **100**          | **100**          |
| Best Practices | 96          | 92 ¹             | 92 ¹             |
| SEO            | 100         | 66 ²             | 66 ²             |
| LCP            | 2.7 s       | **2.5 s**        | 2.8 s            |
| CLS            | 0           | **0.059** ³      | 0                |
| TBT            | 40 ms       | 60 ms            | 40 ms            |
| FCP            | 1.1 s       | 1.7 s            | 1.5 s            |
| Speed Index    | 2.7 s       | 2.7 s            | 2.4 s            |

¹ Both failing audits are deploy-preview artifacts: a 404 and a cookie warning
from Netlify's own preview instrumentation (`app.netlify.com/cdp/…`). A direct
network probe of the same two routes recorded **zero** failed requests and zero
console errors. This should read 96+ on production.

² `X-Robots-Tag: noindex`, which Netlify adds to every deploy preview. Not a
regression — but it also means the SEO category is **unverified** on this
deploy, and must be re-run after merge.

³ **A real regression. See §3.**

### Transfer sizes, gzipped

|               | v1 live `/` | v2 `/ar`     | v2 `/en`     |
| ------------- | ----------- | ------------ | ------------ |
| First-load JS | 178.5 KB    | **236.1 KB** | **236.1 KB** |
| Fonts         | 111.0 KB    | **55.6 KB**  | **84.9 KB**  |
| HTML          | 82.9 KB     | 133.7 KB     | 129.9 KB     |
| JS + fonts    | 289.5 KB    | **291.7 KB** | **321.0 KB** |

**JS went up by 57.6 KB and the 150 KB target was missed by 86 KB.** The
Next 16 + React 19 upgrade alone cost ~70 KB; the perf tasks recovered ~17 KB of
that (server components −5.5 KB, LazyMotion + `motion/react-m` −8.6 KB, CSS
reveals −3.1 KB). Fonts fell by 55.4 KB on Arabic and 26.1 KB on latin.

Netted out, an Arabic visitor transfers about the same as before and a latin
visitor about 31 KB more. **This is not the win the plan was aiming for.**

Two owner decisions bound how far it could go, both deliberate: the remaining
islands keep `motion` (worth roughly 40 KB), and the final target is set in plan
3 once the new hero lands. The HTML also grew — that is RSC flight payload
inlined into the document, which is what buys the server-rendered tree.

### What was actually slow, and what wasn't

The brief's leading suspicion was that cards were fetching `w=3840` images.
**Settled on both deploys, and it was not happening.** A Pixel 7 viewport
scrolling the whole page downloads, identically on v1 live and on the v2
preview:

| Requested width | Count |
| --------------- | ----- |
| 96 px           | 1     |
| 750 px          | 4     |
| 1200 px         | 3     |
| **3840 px**     | **0** |

8 optimized requests, **243.2 KB** total, at `q=70`/`q=75`. The 3840 entry is
the widest `srcset` candidate; a browser picks from `sizes` plus its own width
and DPR, never from the largest available. No megabytes were being wasted here
in v1, and v2's `sizes` attributes did not regress it.

The costs that were real: 111 KB of fonts on every route regardless of locale
(now locale-scoped), and an entirely client-side tree (now server-rendered with
islands). And v1 was never broadly slow by Lighthouse's reckoning — it scored 96
with TBT 40 ms. Only LCP was out of budget at 2.7 s.

---

## 3. Open issue: CLS 0.059 on `/ar`

Over the 0.05 budget, on Arabic only. It does not reproduce locally — CLS
measured 0.0000 on `/ar` and `/en` against `next start` — because a localhost
font serves too fast to shift anything.

Lighthouse attributes the shift to two `.woff2` loads (the Tajawal faces). The
cause is task 9's `preload: false`: fonts are discovered through the stylesheet
rather than preloaded, so they arrive after first paint and swap in. That is the
same change that cut Arabic font bytes in half, so it is a genuine trade-off,
not a mistake to simply revert.

Latin locales measure 0 because Playfair and Inter have closer fallback metrics.

**Not fixed in plan 1.** Candidate fixes, cheapest first: preload only the single
Tajawal face the hero renders; tune `adjustFontFallback` / `size-adjust` for the
Arabic fallback; or reserve the hero heading's height. Each needs re-measuring on
a deploy, since local measurement cannot see this class of bug.

---

## 4. Open issue: security headers do not reach HTML documents

Verified on the preview:

| Response          | nosniff | Referrer-Policy | Permissions-Policy | CSP | HSTS | Cache-Control  |
| ----------------- | ------- | --------------- | ------------------ | --- | ---- | -------------- |
| `/_next/static/*` | ✅      | ✅              | ✅                 | ✅  | ✅   | `immutable` ✅ |
| `/projects/*`     | —       | —               | —                  | —   | —    | `immutable` ✅ |
| **`/ar` (HTML)**  | ✅      | ❌              | ❌                 | ❌  | ✅   | `max-age=0`    |

`netlify.toml` `[[headers]]` are applied by the CDN to files it serves. Pages
come from the Next.js runtime's function, and those responses do not pick the
rules up. So the CSP, `Referrer-Policy` and `Permissions-Policy` that matter
most — the ones protecting the document — are **not being sent**. Only
`nosniff` and HSTS arrive, and those come from Netlify itself.

The immutable caching, which was the other half of task 12, does work.

**B12 is therefore only half closed.** The fix is to emit the document headers
from `headers()` in `next.config.mjs`, so the framework sets them on its own
responses, and leave `netlify.toml` owning static caching. That is a plan 2 task
— it also has to land before `/admin` exists, since an admin route with no CSP
and no `frame-ancestors` is a materially worse thing to ship than a public page
with none.

Two of the six header tests fail against the preview for exactly this reason.
They are correct to fail; they are not being weakened.

---

## 5. Netlify Forms on Next 16: works

The empirical check the owner asked for.

- The static decoy `public/__forms.html` is served: `GET` → 200.
- Submitting the real form on the preview showed the localized success state
  ("Thanks! Your message has been sent…").
- A direct `POST /__forms.html` with the exact field set (`form-name`, `name`,
  `email`, `subject`, `message`) returned **200** and Netlify's own "Thank you!"
  confirmation page.

Two verification submissions were sent (2026-07-28 15:52 UTC, both from
`baymed000@gmail.com`, subject "Next 16 Netlify Forms check"). **Confirm they
appear in Netlify → Forms → contact and delete them** — that dashboard check
needs an account login and is the one piece of this that could not be automated.

No alternative was implemented and none is proposed: the mechanism works.

---

## 6. Environment variables

| Variable               | Required              | Value                                                                             |
| ---------------------- | --------------------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | No                    | Defaults to `https://medmoudsite.netlify.app`. Set it when a custom domain lands. |
| `NODE_VERSION`         | Set in `netlify.toml` | `22.11.0`. Next 16 needs 20.9+.                                                   |

Nothing else yet. Plan 2 adds `ADMIN_PASSWORD_HASH` and `AUTH_SECRET`, which
will live **only** in Netlify environment variables — never in the repo, and not
in an example file carrying a real value. The repository is public.

`sharp` must stay in `dependencies`: Netlify's `prebuild` runs `gen:blur`.

---

## 7. Verification status

| Check                      | Result                            |
| -------------------------- | --------------------------------- |
| `npx tsc --noEmit`         | clean                             |
| `npm run lint`             | clean, zero warnings              |
| `npm run build`            | passes, `/ar` `/en` `/fr` all SSG |
| `npm run test:e2e` (local) | 66 passed, 6 skipped              |
| Header tests (preview)     | 4 passed, **2 failed** — see §4   |
| Lighthouse mobile          | see §2                            |
| Contact form               | works — see §5                    |
| Image widths               | settled — see §2                  |

`npm audit` reports 12 high-severity advisories, all `sharp`/libvips reached
through `next`'s own bundled copy. `npm audit fix --force` proposes
`next@9.3.3`, a six-major downgrade, so it is not a fix. Documented, not applied.

---

## 8. What plan 1 deliberately did not do

The admin panel; OG images, JSON-LD, `sitemap.ts` and `robots.ts` (the rest of
B13); the Prism Stack hero; the contact rework and removal of the public email
address; axe accessibility checks. Full list with context in
`docs/superpowers/baseline/2026-07-27-after-plan-1.md`.

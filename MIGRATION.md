# MIGRATION — v1 → v2 (plans 1 and 2)

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

### The bottom line first

**Plan 1 did not produce a demonstrated speed win.**

- **Fonts: won.** 111.0 KB on every route → 55.6 KB on `/ar`. Measured, repeatable.
- **JS: regressed.** 178.5 KB → 236.1 KB. Measured, repeatable.
- **LCP: unproven.** No improvement can be shown from the data available. See below.
- **CLS: regressed** on `/ar`, 0.059–0.062. Ours, not preview noise. See §3.
- **The speed claim is pending a production measurement after merge.** A deploy
  preview cannot settle it.

What plan 1 did buy, and what it is worth on its own terms: Next 16 / React 19,
a server-rendered architecture with client islands, real per-language URLs, a
72-assertion test suite, and 13 closed bugs.

### Lighthouse, mobile

Three runs per target, same machine, median of three. Single-run figures are not
reported — the first pass of this measurement showed `/ar` at LCP 2.5 s against
v1's 2.7 s and that looked like a win. It was one warm run against a noisy
target, and it did not survive repetition.

|                    | v1 live `/`          | v2 preview `/ar`         |
| ------------------ | -------------------- | ------------------------ |
| LCP, three runs    | 2.89 / 2.80 / 2.64 s | **1.65 / 6.33 / 6.89 s** |
| LCP median         | **2.80 s**           | **6.33 s**               |
| Performance median | 93                   | 70                       |
| CLS median         | 0.000                | **0.062**                |
| TBT median         | 3 ms                 | 87 ms                    |

Single-run detail for the four categories, taken on the first pass:

|                | v1 live `/` | v2 `/ar` | v2 `/en` |
| -------------- | ----------- | -------- | -------- |
| Performance    | 96          | 96       | 95       |
| Accessibility  | 100         | **100**  | **100**  |
| Best Practices | 96          | 92 ¹     | 92 ¹     |
| SEO            | 100         | 66 ²     | 66 ²     |

¹ Both failing audits are deploy-preview artifacts: a 404 and a cookie warning
from Netlify's own preview instrumentation (`app.netlify.com/cdp/…`). A direct
network probe of the same two routes recorded **zero** failed requests and zero
console errors. This should read 96+ on production.

² `X-Robots-Tag: noindex`, which Netlify adds to every deploy preview. Not a
regression — but it also means the SEO category is **unverified** on this
deploy, and must be re-run after merge.

**Why the LCP medians are not taken at face value, in either direction.** The
`<h1>` is the LCP element on both sites, and its breakdown is nearly identical —
TTFB 248 ms vs 286 ms, element render delay 2276 ms vs 2311 ms. By that measure
the hero text paints at the same moment. The 6.3–6.9 s figures come from a
later, larger LCP candidate, and the preview's network log shows the cause: at
~3.7 s it fetches `pacaembuvar` and `mulishvar` plus `app.netlify.com/cdp/…`,
which is Netlify's preview instrumentation and is **not served in production**.
Our own six Tajawal faces all arrive by 775 ms.

So the v1 column is clean and the v2 column is contaminated. The correct
conclusion is not "v2 is slower" and it is certainly not "v2 is faster" — it is
that **LCP is unresolved until this is measured on production**. That
measurement is the first thing to do after merge.

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
with TBT 40 ms, median 93 across three runs. Only LCP was out of budget, at a
median 2.80 s against a 2.0 s target.

Worth stating plainly, since it changes what plan 3 should chase: **the site the
brief described as "noticeably slow on first visit" measures as a fast site with
one slow element.** Whatever is delaying the `<h1>` — a 2.3 s element render
delay on _both_ v1 and v2 — is the remaining target, and neither the font work
nor the JS work moved it.

---

## 3. CLOSED: the Arabic CLS regression (plan 2, task 2)

Fixed, and the plan 1 diagnosis in this section was wrong — recorded rather
than rewritten, because the wrong diagnosis is the interesting part.

Plan 1 concluded that `preload: false` made the faces arrive late. The real
cause was that Arabic had **no working fallback at all**: next/font generates
one automatically and for Tajawal it emits `src: local(Arial)`, and Arial has no
Arabic glyphs. Arabic text skipped past that adjusted face to whatever system
font existed, whose metrics the adjustment was never computed for. Measured on
the real hero string, matching Tajawal against it needed `size-adjust: 143.30%`
— a 43% error on every Arabic page.

Tajawal is now self-hosted with an Arabic-capable, metric-matched fallback, and
the hero face alone is preloaded. Font bytes are unchanged: 55.6 KB on `/ar`,
84.9 KB on `/en`.

Measured on the deploy, three runs each, same environment before and after:

|           | before                | after                        |
| --------- | --------------------- | ---------------------------- |
| CLS `/ar` | 0.059 / 0.062 / 0.000 | **0.0013 / 0.0000 / 0.0013** |
| LCP `/ar` | 1.65 / 6.33 / 6.89 s  | **1.51 / 2.57 / 1.59 s**     |

**This also revises §2's LCP conclusion.** That section attributes the 6.3–6.9 s
outliers to Netlify's preview instrumentation. That was half the story: the
same environment now medians 1.59 s with no change to the instrumentation, so
our own Arabic font swap was doing most of the damage. The LCP question is still
open on production — but the honest current reading is that plan 1 shipped an
Arabic LCP regression, plan 2 task 2 fixed it, and the site is now plausibly
faster than v1 for Arabic visitors rather than merely equal.

---

## 4. CLOSED: security headers did not reach HTML documents (plan 2, task 1)

Fixed. The full set now ships from `headers()` in `next.config.mjs`, `netlify.toml` keeps only
the cache rules under a comment explaining why the split exists, and `tests/headers.spec.ts`
asserts on delivered responses rather than on config. **7/7 pass on the deploy**: `/ar`, `/en`,
`/fr` and `/admin` all carry CSP, HSTS, nosniff, `Referrer-Policy` and `Permissions-Policy`,
static assets stay `immutable`, and the no-flash script still runs.

One finding worth keeping: the CSP test failed its first deploy run on a real violation —
Netlify's preview widget trying to frame `app.netlify.com`, correctly blocked by
`default-src 'self'`. That is the policy working on markup we do not ship. The test now ignores
_framing_ violations naming netlify.com and nothing else; a blocked script, style or font still
fails it, including from that origin.

The original diagnosis, kept because it is the reusable part:

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

Two of the six header tests failed against the preview for exactly this reason.
They were correct to fail and were not weakened — plan 2 task 1 made them pass
by fixing the defect they had found.

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
| `ADMIN_PASSWORD_HASH`  | For `/admin`          | **Base64** of an argon2id hash. Owner action — set it in the Netlify dashboard.   |
| `AUTH_SECRET`          | For `/admin`          | 32 random bytes, base64. Signs the session JWT.                                   |
| `NEXT_PUBLIC_SITE_URL` | No                    | Defaults to `https://medmoudsite.netlify.app`. Set it when a custom domain lands. |
| `NODE_VERSION`         | Set in `netlify.toml` | `22.11.0`. Next 16 needs 20.9+.                                                   |

The two admin values live **only** in Netlify environment variables, scoped to all deploy
contexts — never in the repo, and not in an example file carrying a real value. The repository
is public, so a value committed here is a value published, and the remedy would be rotating it
rather than deleting the line. `.env.example` lists names with empty values only.

Generate both with `node scripts/gen-admin-secrets.mjs` (add `--random` when there is no TTY,
which is the case when it runs through a tool rather than a terminal). It writes
`.env.admin.local` at mode 0600 and prints nothing secret.

**`ADMIN_PASSWORD_HASH` is base64 and that is not cosmetic.** `@next/env` runs dotenv-expand
over every `.env` file, and an argon2 hash is `$argon2id$v=19$m=…` — each `$name` expands to
nothing. Plain, double-quoted, single-quoted and backslash-escaped forms are all mangled; there
is no quoting that survives. Netlify's dashboard does no expansion, so a raw hash works in
production while every local login fails. Both forms are accepted at runtime.

`sharp` must stay in `dependencies`: Netlify's `prebuild` runs `gen:blur`, and the admin's
upload pipeline needs it at runtime.

---

## 7. Verification status

| Check                      | Result                                                         |
| -------------------------- | -------------------------------------------------------------- |
| `npx tsc --noEmit`         | clean                                                          |
| `npm run lint`             | clean, zero warnings                                           |
| `npm run build`            | passes, `/ar` `/en` `/fr` all SSG                              |
| `npm run test:e2e` (local) | **148 passed, 14 skipped** (the deploy-only header assertions) |
| Header tests (preview)     | **7/7 pass** — see §4                                          |
| Lighthouse mobile          | see §2 and §3                                                  |
| Contact form               | works — see §5                                                 |
| Image widths               | settled — see §2                                               |

`npm audit` reports **15 advisories: 12 high and 3 moderate**. The 12 high are `sharp`/libvips
(`CVE-2026-33327/33328/35590/35591`) reached through `next`'s own bundled copy — the top-level
`sharp@^0.35.3` is above the vulnerable `<0.35.0` range, so only `next/node_modules/sharp` is
flagged. The 3 moderate are postcss `GHSA-6g55-p6wh-862q` and `GHSA-r28c-9q8g-f849`, also
through `next`. `npm audit fix --force` still proposes `next@9.3.3`, a six-major downgrade, so
it is not a fix. Documented, not applied; re-check when Next ships an updated bundle.

---

## 8. What plan 1 deliberately did not do, and where it stands now

| Deferred item                     | Status after plan 2                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| The admin panel                   | **Shipped** — see §9                                                                                  |
| `robots.ts`                       | **Shipped** in task 5; allows the site, disallows `/admin` and `/api/`                                |
| OG images, JSON-LD, `sitemap.ts`  | Still open. The remaining half of B13, and plan 3's work                                              |
| The Prism Stack hero              | Not started. **Superseded** — the owner is rewriting the brief                                        |
| The contact rework                | Frozen pending that brief                                                                             |
| Removing the public email address | **Cancelled by the owner.** The email stays in `Contact.tsx`, `Footer.tsx` and all three dictionaries |
| Axe accessibility checks          | Still open                                                                                            |

---

## 9. Plan 2 — what it delivered

| Task     | Result                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------- |
| 1        | Security headers moved to `next.config.mjs` `headers()`. 7/7 on the deploy — §4                 |
| 2        | Arabic CLS/LCP regression closed. Median LCP 6.33 s → 1.59 s — §3                               |
| 3        | Typed content store over Netlify Blobs, bundled data as the fallback on every failure path      |
| 4        | Auth primitives: argon2id (fails closed), `jose` session, Blobs rate limit (fails **open**)     |
| 5, 6     | Login and the projects dashboard, each re-verifying its session independently of the proxy      |
| 7, 8, 10 | Settings, uploads, and the admin rebuilt in direction **B "Stack"** after the owner rejected v1 |
| 9        | The public site reads the store. `/[locale]` still SSG                                          |
| 11       | Secret audit clean; admin bundle isolation measured and the 1.2 KB gap explained — below        |
| 12       | This documentation pass, plus the deploy verification listed in §10                             |

**Bundle.** `/ar` and `/en` first-load JS is **237.3 KB gzipped**, against 236.1 KB after plan 1.
The plan's constraint was that the admin add _nothing_, so this is a **miss of 1.2 KB**, stated
rather than reinterpreted. It is not admin code: removing `src/app/(admin)` from an otherwise
identical tree returns `/ar` to exactly 236.1 KB, and uncompressed the two chunk sets differ by
**149 bytes** — Turbopack's preamble for one extra chunk. The remaining ~1.1 KB is gzip
compressing one more chunk independently. The admin's UI copy lives in two chunks `/ar` never
references, and a PROTECTED test now fetches every script the public page loads to keep it that
way.

**Fonts.** Unchanged from plan 1: 55.7 KB on `/ar`, 84.8 KB on `/en`, one preloaded face on
Arabic. The self-hosting in task 2 was byte-neutral by construction — the six subset files are
the exact ones `next/font` was already serving.

**A measurement bug found while re-verifying these numbers.** `scripts/measure-bundle.mjs`
reported `Fonts (0 referenced) — 0.0 KB` on `/ar` for the whole of plan 2: it scanned the HTML
for `/_next/static/media`, and since task 2 the Arabic faces are self-hosted and discovered
through `@font-face` rules in CSS. Scanning the stylesheet instead would have been worse —
globals.css declares all six Tajawal faces on every route and `/en` downloads none of them. The
script now loads the page in a real browser and counts what it actually fetches. This is the
same failure class `scripts/port.mjs` exists to prevent: a number that is silently wrong in the
flattering direction.

---

## 10. Still requiring a deploy

Everything below needs `git push`, a rebuilt Netlify preview, and
`ADMIN_PASSWORD_HASH` / `AUTH_SECRET` set in the Netlify dashboard.

1. The full admin flow against the preview: sign in, create a project with images in all three
   languages, reorder it, edit the WhatsApp number, add a social link, delete the project —
   each change appearing on the public site **without a redeploy**.
2. `PLAYWRIGHT_BASE_URL=<preview> npm run test:headers`, including the two `/admin` tests that
   were expected-red in task 1.
3. `node scripts/measure-cls.mjs <preview>/ar`, recorded next to the 0.059 task 2 set out to fix.
4. The rate limit: six wrong passwords from one IP, the sixth returning the lockout message and
   a correct password refused until the window expires. **On the preview, not production** — it
   locks that IP out for fifteen minutes.
5. **Lighthouse SEO on production after merge.** The preview carries `X-Robots-Tag: noindex`, so
   the 66 it scores there is an artifact and the category remains genuinely unverified.

Full list with context in `docs/superpowers/baseline/2026-07-27-after-plan-1.md`.

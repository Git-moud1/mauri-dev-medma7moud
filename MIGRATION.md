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
the hero text paints at the same moment. (**Those two figures are whole-document
time-to-paint, not an `<h1>` defect — see §11.** They are near-identical on v1
and v2 for the ordinary reason that both parse a similar document on a similarly
throttled CPU.) The 6.3–6.9 s figures come from a
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
brief described as "noticeably slow on first visit" measures as a fast site.**
Only LCP is out of budget.

> **CORRECTED (plan 3).** This section previously read "a fast site with **one
> slow element**", and named a "2.3 s element render delay" on the `<h1>` as an
> unexplained fault to chase. **That was a misreading of the LCP breakdown and
> there is no `<h1>` fault.** Do not go looking for one. See §11 for the
> measurements that closed it.

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

## 10. Deploy verification — what passed, and what is still untested

Measured against the rebuilt preview at commit `7fa7ae9`:
https://deploy-preview-1--medmoudsite.netlify.app

| Check                             | Result                                                               |
| --------------------------------- | -------------------------------------------------------------------- |
| `npm run test:headers` (preview)  | **7/7 pass**, including both `/admin` tests — see §4                 |
| CLS on `/ar`, three runs          | **0.0000 / 0.0000 / 0.0000** against plan 1's 0.059 / 0.062 — see §3 |
| CLS on `/en`                      | 0.0004                                                               |
| `GET /admin/dashboard` signed out | **307 → `/admin`** — the proxy guard works on the deploy             |
| `GET /admin`                      | 200 with `x-robots-tag: noindex, nofollow`                           |
| `GET /robots.txt`                 | 200, disallows `/admin` and `/api/`                                  |
| Full admin CRUD flow              | **NOT VERIFIED** — see below                                         |
| Rate-limit lockout                | **NOT VERIFIED** — see below                                         |

**Why two checks are unverified.** `ADMIN_PASSWORD_HASH` and `AUTH_SECRET` are not set in the
Netlify dashboard (owner action). No sign-in can succeed without them, so neither the CRUD flow
nor the lockout could be exercised. This is not detectable from outside, and that is the auth
working as designed: `verifyPassword` fails closed on a missing hash, so an unset variable and a
wrong password look identical to a client. A rejected login on the preview is evidence of
neither.

To finish them, set both variables (all deploy contexts), then:

1. Sign in on the preview, create a project with images in all three languages, reorder it, edit
   the WhatsApp number, add a social link, delete the project — each change appearing on the
   public site **without a redeploy**.
2. Six wrong passwords in a row from one IP: the sixth returns the lockout message and a correct
   password is refused until the window expires. **On the preview, not production** — it locks
   that IP out for fifteen minutes.

**A broken reference found while probing.** `robots.txt` advertises
`https://medmoudsite.netlify.app/sitemap.xml`, and that URL **404s** on the preview and on the
live site. `robots.ts` shipped in task 5 pointing at a sitemap plan 2 was never going to
generate. `sitemap.ts` is plan 3 work; this is one more reason not to let it slip.

**Superseded by the results above, kept for the record:**

1. ~~`PLAYWRIGHT_BASE_URL=<preview> npm run test:headers`, including the two `/admin` tests that
   were expected-red in task 1.~~ Done — 7/7.
2. ~~`node scripts/measure-cls.mjs <preview>/ar`.~~ Done — 0.0000 on three runs.

**Only production can settle these:**

- **Lighthouse SEO.** The preview carries `X-Robots-Tag: noindex`, so the 66 it scores there is
  an artifact and the category remains genuinely unverified. Re-run after merge.
- **LCP.** §2 has never resolved this against an uncontaminated target.

Full list with context in `docs/superpowers/baseline/2026-07-27-after-plan-1.md`.

---

## 11. CLOSED: the "2.3 s `<h1>` element render delay" was never an `<h1>` fault

§2 carried this as an open, unexplained defect from plan 1 onward, and it was
about to become the justification for design decisions in plan 3. It is closed
here, with the measurements, because a wrong open bug is more expensive than no
bug: it makes future sessions chase a fault that does not exist.

### What the number actually was

`2.3 s` was **LCP minus TTFB**. For a _text_ LCP with no image, that quantity has
no resource-load phase in it at all — there is nothing to load. It is simply the
time from the first byte to the first paint, and it includes the render-blocking
CSS round trip, HTML parse, style, layout and raster. Calling it an "element
render delay on the `<h1>`" attributed a whole-document cost to one element.

In 4 of 7 runs on `/en`, the `<h1>` **is** the FCP element. There is nothing to
explain.

### Ruled out, each with evidence

- **The `opacity: 0` reveal.** Gone. `Hero.tsx` is server-rendered with no
  client JS; the `motion` entrance that once held the `<h1>` at `opacity: 0` was
  removed and its header comment records why.
- **Font blocking.** `document.fonts.ready` resolves at ~550 ms, long before
  paint. On `/en` the `<h1>` paints at 1968 ms while its two webfonts do not
  finish until 2432 ms and 2505 ms — so it painted in the metric-matched
  fallback, which is `display: swap` working exactly as intended.
- **Main-thread blocking.** The first long task lands at 2132 ms on `/ar`,
  _after_ LCP. There are no long tasks before LCP on either locale.
- **The inlined RSC flight payload.** It is 59,632 B across 21 `__next_f.push`
  scripts — 42.6% of a 140 KB document, which is worth knowing — but **all 21
  sit after the `<h1>`** (h1 at byte 8,918; first push at byte 74,135). None of
  it blocks the headline.
- **Byte position.** Only 7,356 B separate the header logo from the `<h1>`: 35 ms
  of transfer at 1.6 Mbps. It cannot account for a 300–600 ms gap.

### What it is: CPU

Live preview, 390×844, slow-4G in every row. **Only the CPU rate changes.**

| Route | CPU         | median LCP − TTFB | median FCP→`<h1>` gap |
| ----- | ----------- | ----------------- | --------------------- |
| `/ar` | 4× throttle | **1750 ms**       | 284 ms                |
| `/ar` | none        | **549 ms**        | 0 ms                  |
| `/en` | 4× throttle | **1402 ms**       | 0 ms                  |
| `/en` | none        | **490 ms**        | 0 ms                  |

Roughly 70% of the figure is CPU: parsing and rasterising a 140 KB document on a
throttled main thread. The remainder is one render-blocking CSS round trip —
9.1 KB, referenced at byte 449, so it is discovered immediately and that part is
already optimal.

### Two things this changes for plan 3

1. **Run-to-run variance exceeds 1 second** under identical conditions — the
   FCP→`<h1>` gap ranged 0→1832 ms across 7 runs. Any single-run before/after
   number is noise. Hero concepts must be compared on medians over **≥7 runs**.
2. **The bottleneck is main-thread time, not bytes.** A three.js hero costs most
   in parse/compile on the exact resource that is already the constraint, which
   is worse for this site than its KB figure suggests.

### CORRECTION to the numbers above, from later in the same session

The conclusion of §11 stands: **there is no `<h1>` fault.** Every piece of
evidence that established it is independent of how the measurement was run, and
all of it was re-confirmed warm — the `<h1>` is the first contentful paint with a
0 ms FCP-to-LCP gap, on both the pre-hero and post-hero builds, on `/ar` and
`/en`.

**The magnitudes in the table above are wrong, and the "roughly 70% is CPU"
attribution with them.** Those runs did not warm the URL first, so each set
included requests against a cold or partly-cold edge cache, which inflated
time-to-paint. Warmed, nine runs, `/ar`, same 4x CPU throttle and slow 4G:

| Condition                    | LCP - TTFB | TBT   |
| ---------------------------- | ---------- | ----- |
| 4x CPU throttle (unwarmed)   | 1750 ms    | —     |
| **4x CPU throttle (warmed)** | **732 ms** | 74 ms |
| **no CPU throttle (warmed)** | **452 ms** | 0 ms  |

So of a warm 732 ms, CPU throttling accounts for ~280 ms — **about 38%, not
70%.** The remaining ~452 ms is the render-blocking CSS round trip plus parse at
full speed, and that is close to the floor for this document.

**What this reframes.** Lighthouse's original 2.3 s figure is not the warm number
and it is not the CPU number — it is the _cold_ path. That points the remaining
LCP work at **B23** (a statically prerendered route answered by a function, 6.5 s
cold against ~0.37 s warm) rather than at the main thread. B23 was already logged
as the largest real LCP risk on the site; this is the measurement that says so
quantitatively.

**What this does not change.** A2 still costs ~4x A1's blocking time (333 ms vs
87 ms on `/ar`), so main-thread time is still the resource worth protecting in a
hero — the ranking of the two concepts is unaffected.

**Superseded by §12 for concept comparison.** Those two figures were taken against
the deploy preview with an ad-hoc probe that no longer exists. §12 re-measures A1
and A2 alongside A3 on the same kind of URL, with a kept harness, nine runs per
cell and a pre-hero control — so the concept ranking should be read from §12's
table, not from this line. The absolute values differ because §12's TBT window
runs to the end of frame sampling rather than to TTI; the ordering does not.

Recorded rather than quietly edited: the earlier figures were used in this
session's own reasoning, and a corrected document that hides its correction
teaches the next session nothing.

Measured with an ad-hoc Playwright + CDP probe (`Emulation.setCPUThrottlingRate`

- `Network.emulateNetworkConditions`, `PerformanceObserver` on
  `largest-contentful-paint`, `paint` and `longtask`). The probe was not kept — it
  is reproducible from this description, and a script that only ever answered one
  question is not worth maintaining.

---

## 12. Plan 3 — hero concept A3, the depth-map plane

A third concept, built alongside A1 and A2 rather than replacing either.
Reachable at `?hero=a3` on `/ar`, `/en` and `/fr`, through the same query-param
switch, with the same fallback to A1 on an unrecognised value.

**Nothing has been deleted.** A1 and A2 are both still in the tree and still
reachable, which is the point: A3 was built to be measured against both.

### Where every number in this section was measured

Stated once, up front, because §11's correction turned on exactly this question
and a figure without its target is not a figure.

| Table                            | Target                                           |
| -------------------------------- | ------------------------------------------------ |
| Chunk weight                     | deploy preview, commit `a6a2996`                 |
| Blocking time / LCP / frame time | deploy preview, commit `a6a2996`                 |
| Contrast and clipping            | deploy preview, commit `a6a2996`                 |
| The trail's runtime increment    | **both** — shown side by side, and see why below |

Deploy preview means `https://deploy-preview-1--medmoudsite.netlify.app`, which is
the same kind of URL §11's A1/A2 rows were taken against. **No table below mixes a
localhost row with a preview row.** Where a localhost figure is quoted it is
labelled, and it is quoted only against other localhost figures.

The distinction is not pedantry. The preview answers through Netlify's edge and
its Next runtime function, over real TLS at real RTT; `next start` on loopback has
none of that. Chunk weight turned out identical between them — bytes are decided
by the build — but blocking time did not, and the trail's increment was resolvable
on one and not the other.

Every concept was re-verified live on that deploy before these numbers were taken:
`?hero=a1`, `?hero=a2` and `?hero=a3` each engage on `/ar`, `/en` and `/fr`, an
unknown value falls back to A1 on all three, and A3 draws with no console errors.

### What it is

One flat plane, two textures — a photographic base image and a grayscale depth
map — and a TSL fragment graph that offsets the base image's UVs by the depth
value scaled by pointer position. No geometry. The depth is real per-pixel data,
so the parallax holds at the extremes of the motion where A1's 2D shear falls
apart, and there is no extrusion to pay for.

On top of that: a scan line travelling through **depth space** rather than screen
space, revealing a cell-noise dot grid; and a pointer trail evaluated as a capsule
SDF chain against a 16-sample ring buffer, occluded by the same depth map, all
through one bloom pass.

Stack: `three/webgpu` node materials in TSL, `@react-three/fiber` 9.6.1.
`WebGPURenderer` selects its own WebGL2 backend where WebGPU is absent — confirmed
working; headless Chromium reports `WebGPU is not available, running under WebGL2
backend` and renders identically. There is deliberately **no second GLSL path**.

`@react-three/drei` was not added. A3 needs nothing from it, and it would have
been weight on the heaviest of the three concepts.

### The number that decides it: 414 KB

**Measured against the deploy preview** —
`https://deploy-preview-1--medmoudsite.netlify.app`, commit `a6a2996`, the same
kind of URL §11's A1/A2 rows were taken against. Command:

```
node scripts/measure-hero.mjs weight --base=https://deploy-preview-1--medmoudsite.netlify.app
```

It loads the page in a real browser, records which `/_next/static` chunks it
actually requests, and gzips each response body locally rather than trusting the
origin's `content-length` — so the figure is server-independent.

| Cell                  | Total JS transferred | Beyond first-load | Chunks |
| --------------------- | -------------------- | ----------------- | ------ |
| control (poster only) | 200.0 KB             | 0.0 KB            | 0      |
| A1                    | 203.1 KB             | **3.1 KB**        | 1      |
| A2                    | 431.2 KB             | **231.2 KB**      | 2      |
| A3                    | 614.1 KB             | **414.1 KB**      | 3      |

These are byte-identical to the same table taken against a local `next start`,
which is the expected result and worth stating: chunk weight is decided by the
build, not by what serves it. Only the timing table below is host-sensitive.

**A3 is 1.8x the weight of A2, and A2 was rejected at 226 KB.**

The brief estimated A3 would "land near 200 KB gzipped". It does not, and the
reason is structural rather than fixable by trimming: `three/webgpu`'s node and
backend layer is 413.6 KB gzipped on its own, on top of the 277.1 KB
`three.core.js` it shares with the `three` that `@react-three/fiber` already
pulls in. Tree-shaking removes a great deal of the node library, but the
renderer's node builders reach most of it, so what survives is most of what makes
TSL work. There is no version of this concept on this stack that is cheap in
bytes.

**First-load JS is unchanged: 200.0 KB in every cell.** The dynamic import is not
leaking into the entry chunk — a leak would show up as the _control_ growing, not
as a concept shrinking, which is why the control row is measured rather than
assumed. There is no `prefetch` and no `preload` hint on the A3 chunk, and nothing
warms it on `/ar` first paint.

### Blocking time, against a pre-hero control

**Measured against the deploy preview** —
`https://deploy-preview-1--medmoudsite.netlify.app`, commit `a6a2996`. That is the
same kind of URL §11's A1/A2 figures were taken against, and it is the reason this
table can sit beside them. Command:

```
node scripts/measure-hero.mjs measure --base=https://deploy-preview-1--medmoudsite.netlify.app
```

390x844, 4x CPU throttle, slow 4G, charcoal palette, nine runs per cell, medians,
every URL warmed inside its own browser before the first counted run, every run
verified to have engaged the concept under test. All ninety counted runs engaged;
none were discarded.

The **control** row is the pre-hero baseline on the same URL and the same deploy:
`prefers-reduced-motion` emulated, so the capability probe returns `still`, no
concept chunk is ever requested and no canvas is created. It is not a checkout of
the pre-hero commit — reduced motion also stops the page's CSS animations — which
is why the cost is stated as a difference against it rather than as an absolute.

| Route | Cell    | TBT         | vs control   | LCP - TTFB | frame @rest | frame @pointer |
| ----- | ------- | ----------- | ------------ | ---------- | ----------- | -------------- |
| `/ar` | control | 791 ms      | —            | 2059 ms    | 16.7 ms     | 16.7 ms        |
| `/ar` | **A1**  | 897 ms      | **+106 ms**  | 2217 ms    | 16.7 ms     | 16.7 ms        |
| `/ar` | **A2**  | 2156 ms     | **+1365 ms** | 1525 ms    | 16.7 ms     | 33.3 ms        |
| `/ar` | **A3**  | **3138 ms** | **+2347 ms** | 1659 ms    | 16.7 ms     | 33.4 ms        |
| `/en` | control | 1429 ms     | —            | 1578 ms    | 16.7 ms     | 16.7 ms        |
| `/en` | **A1**  | 1861 ms     | **+432 ms**  | 1305 ms    | 16.7 ms     | 16.7 ms        |
| `/en` | **A2**  | 3448 ms     | **+2019 ms** | 1828 ms    | 33.3 ms     | 16.7 ms        |
| `/en` | **A3**  | **5190 ms** | **+3761 ms** | 1608 ms    | 16.7 ms     | 16.7 ms        |

**A3 costs 1.7x A2's blocking time on `/ar` and 1.9x on `/en`, and A2 was already
rejected on this metric.** Against A1 it is 22x on `/ar` and 8.7x on `/en`. TBT is
the metric this site is worst at, so this is the number that decides — and it
agrees with the byte figure, which put A3 at 1.8x A2.

**LCP - TTFB shows no systematic concept effect** (1305-2217 ms, and the slowest
row is the _control_). That is the lazy boundary working: whatever a concept
costs, it costs after the headline has painted. It is also why LCP cannot be used
to choose between them.

The same ten cells taken against a local `next start` ranked the concepts
identically (`/ar`: 815 / 851 / 2284 / 3455 ms). Those numbers are **not** in this
table, because a localhost row and a preview row are not the same measurement —
the preview answers through Netlify's edge and its Next runtime function, over
real TLS at real RTT. Mixing them would be §11's warm/cold mistake in a new
costume.

### The trail: bytes settled, runtime not

**Bytes: zero, and that one is solid.** `?hero=a3` and `?hero=a3&trail=0` transfer
byte-identical JS on the preview (614.1 KB, the same three chunks), because the
switch pins the trail's bounding radius to zero and the same compiled shader takes
the early-out. Same graph, same shader, same bytes.

**Runtime cost: not established by this harness.** The trail-off cells did not
behave, and the honest thing is to show them rather than to quote whichever pair
flattered the conclusion:

| Target                 | Route | A3      | A3 without trail | apparent increment |
| ---------------------- | ----- | ------- | ---------------- | ------------------ |
| deploy preview         | `/ar` | 3138 ms | **4836 ms**      | **−1698 ms**       |
| deploy preview         | `/en` | 5190 ms | **1909 ms**      | **+3281 ms**       |
| localhost `next start` | `/ar` | 3455 ms | 2749 ms          | +706 ms            |
| localhost `next start` | `/en` | 5283 ms | 2878 ms          | +2405 ms           |

Four measurements of one quantity, spanning −1698 ms to +3281 ms and disagreeing
in **sign**. On the preview, turning the trail off appears to make `/ar` slower
than leaving it on, and makes `/en` cheaper than A2 — both impossible. The trail's
TBT cost is below this harness's noise floor and nothing should be claimed for it.

Why it is not resolvable here: TBT counts main-thread long tasks, and headless
Chromium has no GPU. Under SwiftShader the fragment shader runs on the CPU and
blocks the thread that issued the draw, so the trail's cost lands in the same
figure as page scripting and is then swamped by network and scheduling variance —
which the preview adds a great deal more of than localhost does. On real hardware
the capsule loop runs on the GPU and would not enter TBT at all.

What did reproduce is the **frame-time signal on localhost**: A3 under scripted
pointer motion dropped to 33.3 ms (30 fps) while A3 without the trail held 16.8 ms
(60 fps) on `/en`. On the preview even that separation is lost in the noise. A
median over an idle page would have missed the trail entirely in every one of
these runs, which was the reason for sampling under motion at all.

Settling this properly needs a GPU-backed run on real hardware, and it is not on
the critical path for the decision: A3's 414 KB and its TBT ranking do not depend
on the trail either way.

### Colour: the blue is a direction, not a token value

The reference multiplies its mask by `vec3(10, 0, 0)` — a direction in colour
space scaled well past 1.0. Substituting the brand blue is therefore not a
substitution of the token, because the same scalar gain on a different direction
lands at a different luminance, and the bloom threshold is a luminance test.

- Pure red at gain 10 has Rec.709 luminance `10 * 0.2126 = 2.13`.
- `--glow-2` (`#3B82F6`) renormalised so its peak channel is 1.0 is
  `(0.240, 0.528, 1.000)`; its luminance per unit of gain is
  `0.2126*0.240 + 0.7152*0.528 + 0.0722*1.000 = 0.501` — the token carries a lot
  of green.
- Matching the reference's luminance therefore needs **gain 4.2, not 10**.

Chosen and recorded:

| Constant          | Value   | Why                                                   |
| ----------------- | ------- | ----------------------------------------------------- |
| `MASK_GAIN`       | 4.2     | luminance-matched to the reference red, per the above |
| `TRAIL_GAIN`      | 3.4     | set last, after the scan line — shared bloom budget   |
| `BLOOM_STRENGTH`  | 0.62    |                                                       |
| `BLOOM_RADIUS`    | 0.55    |                                                       |
| `BLOOM_THRESHOLD` | **1.0** | sits _at_ the photograph's white point                |

The threshold is the one that matters. Below 1.0 the white cards in the app
screenshot start blooming and the whole reason for using a real UI is lost to a
haze. At 1.0 the only things in frame that bloom are the over-unity emitters.

### Contrast and clipping, measured on the worst frame

**Measured against the deploy preview** —
`https://deploy-preview-1--medmoudsite.netlify.app`, commit `a6a2996`:

```
node scripts/measure-hero.mjs verify --base=https://deploy-preview-1--medmoudsite.netlify.app
```

Dark palette (`--bg = 11 12 16`), twelve frames across a full scan sweep with the
pointer moving throughout. Emitter pixels are isolated by blue dominance so the
photograph's own white does not contaminate the figure — the first version of this
check reported peak luminance 255 on every frame, because the brightest pixel on
the canvas is a white card in the app, not the glow.

| Route | dimmest lit frame | brightest frame | saturated pixels added by the emitters |
| ----- | ----------------- | --------------- | -------------------------------------- |
| `/en` | **7.55:1**        | 9.80:1          | **0.000%**                             |
| `/ar` | **7.54:1**        | 7.79:1          | **0.000%**                             |

The same check against a local `next start` gave 7.55:1 and 7.54:1 at the dimmest
lit frame — identical, as it should be. Only the brightest-frame figure moves
(9.31 and 8.25 locally), because which frame happens to be brightest depends on
where the scan sweep is when a capture lands, not on the host.

Both clear the non-text 3:1 floor at their _weakest_, which is the test the
WhatsApp pill and the floating button were fixed under.

The two over-unity emitters do not clip when they overlap, and that is structural
rather than tuned: the scan mask and the trail are combined with `max`, never a
sum, as are the individual capsules within the trail. Summing them is what
produces the white smear the brief names as the failure mode. The residual 0.012%
of saturated pixels is the app screenshot's own white, and is identical with the
trail on and off.

### Corrections applied to the reference code

All four from the brief, plus a fifth found against the installed three:

1. **The frozen scan line.** `float(uScanProgress.value)` reads `.value` at
   graph-construction time — when it is 0 — and compiles that in as a literal.
   Fixed by passing the uniform node itself.
2. **No teardown.** `RenderPipeline`, the node material and both textures are now
   disposed in a `useEffect` cleanup whose dependencies match the `useMemo` that
   created them. With three locale routes and a concept switch, the original
   would stack render targets at canvas resolution for the life of the tab.
3. **Two `useFrame` callbacks merged into one**, at priority 1. Because the render
   call is the last statement in it, the "priority-1 callback must run last"
   ordering is satisfied by construction rather than by getting two priorities
   right. It is also now the only place any uniform is written.
4. **`titleWords` hoisted out of the component.** It was rebuilt every render with
   only `.length` in the dependency array — a new array identity feeding an effect
   that could not see it had changed. It is derived per locale at module scope in
   `HeroWords.tsx`.
5. **`PostProcessing` and `renderAsync()` are both deprecated** in three 0.185
   (r183 and r181), and each emits a console warning. A3 uses `RenderPipeline` and
   `render()`, with `await renderer.init()` in the async `gl` factory where it
   belongs. `@types/three@0.185.1` exports `RenderPipeline`, so this costs no
   casts.

A sixth thing, found only at runtime: the whole fragment graph has to be built
inside a TSL `Fn`. `toVar()`, `If()` and `Loop()` all emit statements, and a
statement needs a stack, which only exists while a shader function is being built.
Constructing the graph at module scope the way the reference does for its simpler
expression-only material throws `Cannot read properties of null (reading 'If')`
the moment a loop is added.

### Two things the brief asked for that were built differently, and why

**The depth map is exported, not estimated.** The brief asks for Depth Anything V2
or MiDaS rather than hand-painting, _unless_ the mockup is rendered in a 3D tool,
in which case the depth buffer should be exported directly because it will be
exact. That is the path taken. `scripts/gen-hero-depth.mjs` composites a real
Swift Eats screenshot into a device body by an explicit pinhole projection of a
plane in space, so the camera-space distance of every pixel on that plane is known
in closed form and there is nothing for a model to infer. The result has both
properties the brief says hand-painting gets wrong: a continuous ramp across the
screen plane, because the plane is genuinely oblique, and a hard step at the
silhouette.

Assets: `public/hero/a3-base.webp` 14.0 KB and `a3-depth.webp` 6.7 KB, both
1024x512 (powers of two), depth written **lossless** — lossy WebP hides error
where the eye does not look, which on a smooth ramp means banding, and this ramp
is not being looked at, it is being used as a coordinate. `NearestFilter` is
explicitly off; the depth map has to interpolate.

**RTL needs a second pair of assets, not a mirrored shader.** The first RTL pass
mirrored the canvas UV the way A1 does. On A1 that is correct, because A1 draws
signed distance fields with no handedness. Here the texture contains a photograph
of a real app, and mirroring the canvas mirrored the UI inside the screen: `/ar`
shipped a phone running an app whose own text ran backwards. That is not an RTL
composition, it is a broken one — the exact "RTL was a port" tell the poster's
comment warns about.

The geometry is mirrored at composite time instead: `a3-base-rtl.webp` /
`a3-depth-rtl.webp` (14.3 KB / 6.9 KB) put the phone on the reading-end edge for
Arabic, angled correctly for where it sits, lit from the matching side, with
legible UI. There is now no mirroring anywhere in the shader — only two numbers
that differ per direction. Cost: one extra pair of files in the repo and **zero
extra bytes for any visitor**, since a page fetches only its own direction's pair.

### A3's real limitation: it cannot render on the light palette

**The base image bakes a charcoal backdrop, so A3 does not follow the theme.** A1
is procedural and re-reads `--bg` live; A2 reads the token into its fog and
materials. A3's backdrop is a photograph, and it stays dark on a light page.

This was found by capturing a light-theme frame rather than by reasoning about it,
and it is worse than a style mismatch: with the light palette active, `--fg` is
near-black, and the hero's headline ends up as dark text sitting on A3's dark
image. **The `<h1>` stops being readable.** See
`.hero-measure/a3-en-light-theme.png`.

Retinting the backdrop live was tried and abandoned. The only honest way to do it
is to re-key the baked backdrop's level to the live token, which on the light
palette lifts the whole backdrop to ~0.93 linear — above the bloom threshold — and
turns the hero into a white haze. Washing the composition out instead drags the
emitters below the 3:1 floor the section above just established.

So **A3 declines the light palette** and the poster stays, through the same
mechanism as every other "not here" case:
`data-hero-layer="poster" data-hero-reason="light-palette"`. The check lives in
`HeroCanvas`, not in the shared capability probe, because it is true of A3 alone —
and it is evaluated _after_ `capability`, so a reduced-motion visitor on the light
theme is still told `reduced-motion`, which is the same ordering principle the
probe itself follows. `hero.spec.ts` asserts both halves: that A3 declines, and
that A1 does not.

The debug attribute now carries five distinguishable reasons —
`reduced-motion`, `no-webgl`, `save-data`, `low-end`, `light-palette` — plus `ssr`
before hydration. The three the brief named are all still separable.

This is a genuine cost of the depth-map approach against A1, and it is exactly the
kind of thing that should decide between concepts: A3 is not merely heavier than
A1, it serves a smaller share of visitors.

### Text overlay: no second headline

The reference hero reveals its own `<h1>` word by word. That cannot ship here, and
not because of the placeholder copy: `Hero.tsx`'s `<h1>` is server-rendered
specifically so it paints with the document, and `hero.spec.ts` asserts no `<h1>`
lives inside the animated layer. Repeating the headline over the canvas would
either duplicate the LCP text on screen or hide the server-rendered one behind a
lazily-loaded chunk — which is the regression plan 1 removed when it deleted the
`opacity: 0` entrance.

So the reveal was kept and pointed at something not already on the page: the name
of the project _in the image_, from `src/data/projects.ts`. Reveal order follows
reading direction and is reversed on `/ar` by mirroring the reveal index, not the
DOM. `uppercase` is gated off for Arabic — the script has no case, so the class is
inert at best and interferes with shaping at worst; Arabic gets letter-spacing
instead. The scroll affordance is a real anchor with `pointer-events-auto` on
itself alone and a visible `focus-visible` ring; the new `hero.scrollHint` key is
translated in all three dictionaries. No English placeholder copy ships.

### Reproducing any of this

Against the deploy preview — the form every table above was taken with:

```
PREVIEW=https://deploy-preview-1--medmoudsite.netlify.app
node scripts/measure-hero.mjs weight  --base=$PREVIEW
node scripts/measure-hero.mjs verify  --base=$PREVIEW
node scripts/measure-hero.mjs measure --base=$PREVIEW
```

Against a local build — comparable only to other local runs:

```
npm run build
npm run gen:hero-depth          # regenerates both asset pairs
node scripts/measure-hero.mjs measure
```

`--base` is the whole reason the tables above can sit beside §11's. Without it the
script owns a `next start` on port 3210; with it, it measures the deployed target
as found and does not rebuild, redeploy or purge anything first — the point of
measuring the preview is to measure what a visitor gets. The chosen target is
printed above the table, written into every row of `runs.json` and stamped on
`.hero-measure/progress.log`, so a number cannot be quoted without its provenance.

Four decisions inside the harness that the numbers depend on:

- **`domcontentloaded`, not `load`.** `load` waits for every subresource, which on
  this site means the whole projects grid's imagery — none of it above the fold,
  none of it anything the hero waits on — and it folded those image-decode long
  tasks into every cell's TBT. Nothing here reads the `load` event: LCP, FCP and
  long tasks arrive through buffered observers, TTFB off the navigation entry.
- **The settle waits for engagement, not for a fixed interval.** A fixed wait has
  to be long enough for the slowest cell — A3's 414 KB chunk over slow 4G — so
  every other cell pays for it. Waiting on `[data-hero-layer="<concept>"]` takes as
  long as each cell needs, and a run that never engages inside 20 s is discarded
  rather than counted as a slow one.
- **One browser process per cell**, warmed inside that browser. A shared browser is
  a plausible way for earlier cells to leave later ones on a heavier process, and
  the cells run in increasing order of cost, so any drift would push the same way
  as the effect. To be clear: **no drift was ever measured.** An earlier run was
  abandoned on the belief that it had slowed to a crawl, and that belief turned out
  to be a misreading of a block-buffered progress stream. The guard stays because
  it is cheap, not because it fixed something observed — an unexplained "fix" that
  is really a superstition is how a harness accumulates ritual. Per _cell_ and not
  per _run_, because a fresh browser has a cold HTTP cache and warming the URL
  inside it is the whole point of the warm-up navigation.
- **A transient failure discards its run, not the table.** Nine of ten cells were
  lost once to a single 30 s navigation timeout during a warm-up.

`scripts/measure-hero.mjs` is kept, unlike section 11's ad-hoc probe. Section 11
noted that "a script that only ever answered one question is not worth
maintaining"; that question has now been asked four times, and two of the answers
were wrong — once because the runs did not warm the URL, once because they were
taken against the wrong kind of URL entirely. Both are properties of the harness
rather than of the operator's memory, which is why the harness is a file.

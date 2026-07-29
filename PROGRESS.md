# v2 Progress

One block per task. Bundle figures are gzipped, measured with
`node scripts/measure-bundle.mjs` against `next start` on a fresh build —
`next start` serves uncompressed, so the script gzips locally to stay
comparable with Netlify.

Tasks 0–10a are recorded in their commit messages; this log starts at 10b.
State at that point (commit `f955f21`): `/ar` and `/en` both 238.7 KB JS;
fonts 55.7 KB on `/ar`, 84.8 KB on `/en`.

---

## Task 10b — Reveal without the animation library

**What changed**

- `src/components/Reveal.tsx` rewritten: IntersectionObserver plus a CSS class
  flip, no `motion` import. Holds no React state — the reveal is one class
  added imperatively to a node that never re-renders, which also avoids
  `react-hooks/set-state-in-effect`.
- `src/app/globals.css`: `.reveal` / `.reveal-in` added under
  `@layer components`, declared **after** `.card-hover` because both land on the
  same elements and `transition` is a shorthand — last declaration wins, so the
  hover properties are repeated in `.reveal`.
- `src/components/islands/ProjectsGrid.tsx`: comment recording the filter-pill
  decision (jumps rather than slides; `domAnimation` has no layout projection
  and `domMax` costs 12.0 KB — not taken).
- `tests/smoke.spec.ts`: two tests added. One is protected (see below).

**Bundle**

| Route | Before (f955f21) | After        | Delta   |
| ----- | ---------------- | ------------ | ------- |
| `/ar` | 238.7 KB         | **235.6 KB** | −3.1 KB |
| `/en` | 238.7 KB         | **235.6 KB** | −3.1 KB |

Fonts unchanged: 55.7 KB `/ar`, 84.8 KB `/en`, 0 preloaded on both.

The drop is small on purpose. `motion` was never Reveal's cost alone — the `m`
core plus `domAnimation` still ship for LanguageSwitcher, ThemeToggle, the
drawer, ProjectsGrid, FloatingWhatsApp and ContactForm. Removing Reveal drops
only its own variants. Owner decision stands: the remaining islands keep their
motion, and the final JS target is set in plan 3 once the new hero lands.
**Still over the original 150 KB figure at 235.6 KB.**

**Bugs**

- B3 partially closed: every reveal on the page now honours
  `prefers-reduced-motion: reduce`, twice over — the CSS renders `.reveal`
  visible and transition-less under the media query (which also covers a
  visitor mid-hydration), and the effect reveals immediately instead of waiting
  for a scroll. The rest of B3 belongs to Task 14.

**Protected test added**

`every section ends up with a revealed element at opacity > 0` — Playwright
counts an `opacity: 0` element as visible, so a page whose reveals never fire
renders blank and still passes every other assertion in the suite. The test
reads computed opacity per section, and first asserts that `#contact` starts at
0, so a build where Tailwind purged `.reveal` entirely cannot pass either. Do
not weaken it to `toBeVisible()`.

**Build status**

`npx tsc --noEmit` clean · `npm run lint` 0 errors, 1 pre-existing warning
(`ThemeProvider` set-state-in-effect, that is B4, fixed in Task 14) ·
`npm run build` passes, three routes still SSG · `npm run test:e2e` 48/48 pass.

**Known gap, not a regression**

With JavaScript disabled, `.reveal` stays at `opacity: 0` outside the
reduced-motion query, so the page renders blank for that visitor. Same for a
hydration failure. Worth closing with a `<noscript>` rule; carried into Task 11.

**Next:** Task 11 — defer paint for below-the-fold sections.

---

## Measurement harness — refuses to run against a stale server

Not a plan task. Landed because three separate measurements in this plan came
back flatteringly low from a server that was not serving the build under test.

- `scripts/port.mjs`: kill listeners on a port, verify, throw if any survived.
- `scripts/measure-bundle.mjs`: owns the server for localhost targets, and
  aborts without printing a total if any referenced asset does not return 200.
  A missing asset is counted as zero bytes, so this class of failure always
  biases the number **downward**.
- `scripts/measure-cls.mjs`: new, same ownership rule. Total shift and worst 5s
  session window on a mobile profile across a full-page scroll.
- `playwright.config.ts`: `reuseExistingServer: false` unconditionally.

The CLS instrument was validated against a deliberately injected 300px shift
(reported 0.3576), so a reading of 0.0000 below means no shift, not no
instrument.

---

## Task 11 — defer below-the-fold paint, and the no-JS blank page

**What changed**

- `globals.css`: `.defer-paint` (`content-visibility: auto`) plus a per-section
  `contain-intrinsic-size`. Applied to TechMarquee, About, Process, Contact and
  Footer. **Not** to Hero (LCP region) or Projects (too close to the fold).
- The intrinsic sizes are measured, not guessed — Pixel 7 and Desktop Chrome,
  Arabic and latin, with a `lg` media query because desktop lays the same
  content out roughly half as tall and an over-reserved section shifts exactly
  as badly as an under-reserved one.
- The marquee's infinite animation now stops while offscreen:
  `content-visibility: auto` suspends animations in a skipped subtree.
- `layout.tsx`: a `<noscript>` style block that reveals `.reveal` and
  `[data-anim-in]`.
- `data-anim-in` added to the three server-rendered elements that motion
  renders at `opacity: 0`: project cards, floating WhatsApp button, theme icon.

**CLS — measured before and after, as asked**

| Route | Before                              | After           |
| ----- | ----------------------------------- | --------------- |
| `/ar` | 0.0000 (worst window), 0.0000 total | 0.0000 / 0.0000 |
| `/en` | 0.0000 (worst window), 0.0000 total | 0.0000 / 0.0000 |

No movement at all. The deferral stays.

**Bundle:** `/ar` and `/en` unchanged at 235.6 KB — this task spends no JS.

**The no-JS bug, which was worse than expected**

With JavaScript disabled the page rendered blank: every `.reveal` sits at
`opacity: 0` waiting for an IntersectionObserver that never runs. The
`<noscript>` override fixes that half.

The new test then caught a second, independent instance the fix did _not_
cover. `ProjectsGrid` renders each card as a motion element with
`initial={{ opacity: 0 }}`, which server-renders as an inline `opacity: 0` and
is only cleared when the animation library hydrates. So the project cards — the
reason a client is on the page — stayed invisible even after the reveals were
fixed. Same for the floating WhatsApp button and the theme icon. Hence
`data-anim-in` rather than a `.reveal`-only rule.

Assertion detail: the test multiplies computed opacity up the ancestor chain.
Checking the card alone would have passed while a `.reveal` wrapper above it
held everything at zero.

**Build status**

`npx tsc --noEmit` clean · `npm run lint` 0 errors, 1 pre-existing warning (B4,
Task 14) · `npm run build` passes · `npm run test:e2e` **50/50 pass**.

**Next:** Task 12 — security and immutable cache headers.

---

## Task 12 — security and cache headers

**What changed**

- `netlify.toml`: `X-Content-Type-Options`, `Referrer-Policy`, HSTS with
  preload, `Permissions-Policy` denying camera/microphone/geolocation, and a
  CSP with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `connect-src 'self'`.
- Immutable one-year cache for `/_next/static/*` and `/projects/*`.
- Three tests, skipped unless `PLAYWRIGHT_BASE_URL` points at a deploy —
  Netlify applies these headers, `next start` does not, so a local assertion
  would be theatre. One of them checks that the CSP did not block the no-flash
  script, which the header assertions alone cannot see.

**Owner decision needed: `script-src 'unsafe-inline'`**

The spec asks for a nonce-based CSP. The plan's fallback was to hash the inline
no-flash script instead. Both are blocked, for different reasons:

- A **nonce** must be minted per request, which forces every route to render
  dynamically and discards the prerendered CDN HTML that Task 6 exists to
  produce.
- A **hash** does not scale here. The built HTML for one route contains 22
  inline scripts — 21 of them Next's own RSC flight payload — and a browser
  ignores `'unsafe-inline'` the moment any hash is present. Hashing only
  no-flash would block the other 21, and the page would never hydrate.

So the policy ships with `script-src 'self' 'unsafe-inline'` and this is
recorded rather than buried. Three ways out, in rough order of cost:

1. Generate hashes for all 22 inline scripts in a post-build step that writes a
   Netlify `_headers` file per route. Automated, but regenerates every build.
2. Move to a nonce once plan 2 adds `/admin`, accepting dynamic rendering for
   the routes that need it and keeping the public routes static.
3. Accept `'unsafe-inline'` for scripts and rely on the rest of the policy.

Everything else in the header set is strict; this is the one loose directive.

**Build status**

`npx tsc --noEmit` clean · `npm run lint` 0 errors, 1 pre-existing warning (B4)
· `npm run test:e2e` 50 passed, 6 skipped (the deploy-only header tests).

**Not yet verified on a deploy.** These headers cannot be proven locally. They
need `git push` and a run against the Netlify preview URL.

**Next:** Task 13 — strict TypeScript, flat ESLint, Prettier.

---

## Task 13 — strict TypeScript and type-aware lint

`noUncheckedIndexedAccess`, `typescript-eslint` `strictTypeChecked`, the full
jsx-a11y recommended set, Prettier. 14 type errors and 41 lint errors, all
fixed, none suppressed inline.

The type errors were real, not ceremony:

- `ProjectGallery` could pass `undefined` to `next/image`, and its focus trap
  dereferenced the first and last focusable without checking — a throw there
  strands the visitor inside the dialog.
- `ContactForm.encode` indexed a `Record` by key and would have posted the
  literal `"undefined"` as a field value. Its field lookups were cast to
  non-null while the optional chains they relied on were the only thing
  preventing a throw. `FormData` values are `string | File`, and `String(file)`
  posts `"[object File]"` rather than failing.
- `i18n/server.ts` walked the dictionary through an `any` cast.

Two config decisions, both in one place rather than scattered inline disables:
`restrict-template-expressions` allows numbers, and jsx-a11y's rules are spread
as bare rules because eslint-config-next already registers that plugin.

Prettier was applied repo-wide as a **separate commit** so these fixes stay
readable.

**Bundle:** unchanged — toolchain only.

**Build status:** tsc clean · lint 0 errors, 1 warning (B4, closed in Task 14) ·
build passes · 50 e2e pass, 6 skipped.

**`npm audit`:** 12 high, all `sharp`/libvips advisories reached through
`next`'s own bundled copy. `npm audit fix --force` proposes `next@9.3.3` — a
six-major-version downgrade — so it is not a fix. Documented, not applied.

**Next:** Task 14 — close the bug register.

---

## Task 14 — bug register closed (B1–B10, B18)

| Bug | Fix                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Drawer closes when the viewport crosses `lg`, so `open` can never be stranded true while the panel is `lg:hidden` and the body stays scroll-locked.                                                                                                                                     |
| B2  | Marquee direction follows the locale; `marquee-rtl` was defined in the Tailwind config and never wired up.                                                                                                                                                                              |
| B4  | See below — the interesting one.                                                                                                                                                                                                                                                        |
| B5  | `AnimatePresence` moved up into `ProjectsGrid`. Inside `ProjectGallery` it wrapped content the parent unmounted outright, so the exit animation never had anything to animate.                                                                                                          |
| B6  | Already closed: `Footer` is a server component since Task 8, so `getFullYear()` runs once at build.                                                                                                                                                                                     |
| B7  | Drawer is a real dialog: `role`, `aria-modal`, `aria-controls`, focus moved in on open, Tab trapped inside, focus returned to the toggle on close, Escape closes. Body overflow restores its **previous** value, so a drawer closing over an open lightbox no longer unlocks scrolling. |
| B8  | Language menu: arrow keys, Home/End, Escape and selection return focus to the trigger, and the document listeners are attached only while it is open.                                                                                                                                   |
| B9  | Field errors clear on change instead of persisting until the next submit.                                                                                                                                                                                                               |
| B10 | `Logo` takes `priority` as an opt-in; only the header passes it. The offscreen footer copy no longer preloads against the hero.                                                                                                                                                         |
| B18 | The universal `border-color` reset is gone.                                                                                                                                                                                                                                             |

**B4 was not what the plan thought it was**

The plan's fix — derive `ThemeProvider`'s initial state from the class no-flash
wrote on `<html>` — trades one bug for a worse one. The server cannot know the
stored theme, so it always renders the dark variant; a light-theme visitor's
first client render then disagrees with the server HTML. That is a hydration
mismatch: **React error #418, reproduced on every load**, after which React
discards the server-rendered tree and re-renders everything. It also broke three
unrelated tests, which was the first symptom.

The fix is to stop branching on theme in rendered output at all. Both icons are
now in the DOM and CSS picks one through the `dark:` variant — driven by the
same class no-flash already set, before React exists. The accessible name became
one static string describing the action (`theme.toggle`) instead of two
describing the destination, so it needs no branch either. `theme.toLight` and
`theme.toDark` were removed from all three dictionaries.

**B18 needed a second half the plan did not mention**

Deleting `* { border-color: rgb(var(--border)) }` alone would have turned every
bare `border` utility gray: Tailwind's preflight already emits a universal
border-colour rule, defaulting to `gray-200`. Setting `borderColor.DEFAULT` in
the Tailwind config makes preflight emit the themed value directly, which is
what removes the duplicate rather than the theming.

`react-hooks/set-state-in-effect` is back to **error** now that B4 and B11 are
both closed.

**Bundle:** `/ar` and `/en` — see the final numbers in Task 15.

**Build status:** tsc clean · lint clean, **zero warnings** · build passes ·
`npm run test:e2e` **66 passed, 6 skipped** (the deploy-only header tests).

**Next:** Task 15 — measure, document, hand off.

---

## Task 15 — measure, document, hand off

Full numbers in `docs/superpowers/baseline/2026-07-27-after-plan-1.md`, which is
the file `MIGRATION.md` reads from in plan 3.

**Final, measured locally on a fresh build**

|                         | `/ar`    | `/en`    | `/fr`    |
| ----------------------- | -------- | -------- | -------- |
| First-load JS (gzipped) | 236.1 KB | 236.1 KB | 236.1 KB |
| Fonts                   | 55.6 KB  | 84.9 KB  | 84.9 KB  |
| Font preloads           | 0        | 0        | 0        |
| CLS (worst 5s window)   | 0.0000   | 0.0000   | —        |

Against the Next 14 starting point: fonts down from 111.0 KB on every route; JS
**up** from ~183 KB to 236.1 KB. The Next 16 + React 19 upgrade cost ~70 KB and
the perf tasks clawed back ~17 KB of it. **The 150 KB target was not met.** Per
owner decision the remaining islands keep `motion` (worth roughly 40 KB), and
the real target is set in plan 3 once the new hero lands.

**README updated** — header, §1, §3, §4, §5, §6, §11, §12, §13, §14, §15. The
"single route, client-side i18n" architecture it described no longer exists.
Four new gotchas were added, each one a bug that actually shipped during this
plan: never render markup that branches on the theme; import `m` from
`motion/react-m`; keep Tailwind class names as unbroken literals; measurement
scripts kill whatever holds their port.

**Cannot be done without a deploy** — needs `git push` and a Netlify preview:

1. Lighthouse mobile scores for all four categories.
2. The security and cache headers (6 skipped tests).
3. Whether Netlify Forms still works on Next 16 — the empirical check the owner
   asked for. If it fails, the instruction is to report and stop, not to switch
   to an alternative.

**Plan 1 is complete apart from those three.**

---

## Deploy verification — PR #1

Preview: https://deploy-preview-1--medmoudsite.netlify.app

The first two Deploy Previews failed to build. Cause was a Netlify plan limit on
private repos, not the code; the owner made the repository public and the third
build passed. `NODE_VERSION = "22.11.0"` was pinned in `netlify.toml` along the
way — Next 16 needs 20.9+ and the site predates that.

Full write-up in `MIGRATION.md`. Headlines:

**Lighthouse** — `/ar` 96 / 100 / 92 / 66, `/en` 95 / 100 / 92 / 66, against the
live v1 baseline of 96 / 100 / 96 / 100. The Best Practices and SEO drops are
both deploy-preview artifacts (Netlify's own instrumentation, and the
`X-Robots-Tag: noindex` it puts on every preview). SEO is therefore _unverified_
until after merge.

**Two real findings, neither fixed here:**

1. **CLS 0.059 on `/ar`** — over the 0.05 budget, Arabic only, attributed by
   Lighthouse to the Tajawal faces swapping in. It is the direct cost of task 9's
   `preload: false`, which is also what halved Arabic font bytes. It does **not**
   reproduce locally (0.0000), because localhost serves fonts too fast to shift
   anything. First measurement of this whole plan that only a real deploy could
   produce.
2. **Security headers never reach HTML documents.** `netlify.toml` headers apply
   to files the CDN serves; pages come from the Next runtime's function and do
   not pick them up. Static assets get the full set plus immutable caching; `/ar`
   gets only `nosniff` and HSTS, both from Netlify itself. **B12 is half closed**
   — CSP, `Referrer-Policy` and `Permissions-Policy` are absent exactly where
   they matter. Two of the six header tests fail against the preview and are
   correct to fail.

**Contact form works on Next 16.** `POST /__forms.html` → 200 with Netlify's
confirmation page, and the UI shows its success state. Two test submissions were
sent and need deleting from Netlify → Forms → contact. No alternative
implemented, none needed.

**The `w=3840` suspicion is settled, on a real deploy.** A Pixel 7 viewport
downloads 1× 96px, 4× 750px, 3× 1200px — 8 requests, 243.2 KB, **zero at 3840**
— identically on v1 live and the v2 preview. It was never the cause of the slow
first load, and v2's `sizes` did not regress it.

**Deploy-measured transfer**, confirming the local figures:

|       | v1 live  | v2 `/ar` | v2 `/en` |
| ----- | -------- | -------- | -------- |
| JS    | 178.5 KB | 236.1 KB | 236.1 KB |
| Fonts | 111.0 KB | 55.6 KB  | 84.9 KB  |

**Next:** plan 2 (admin panel), with the document-headers fix folded in as a
prerequisite — an `/admin` route with no CSP and no `frame-ancestors` is worse
to ship than a public page with none.

---

# Plan 2 — security, CLS, admin panel

## Task 1 — security headers that actually arrive (closes B12)

**What changed**

- Full header set moved from `netlify.toml` to `next.config.mjs` `headers()`:
  CSP, HSTS (`max-age=63072000`, preload), `nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` denying camera,
  microphone and geolocation. Plus `X-Robots-Tag: noindex, nofollow` on
  `/admin/:path*`.
- `netlify.toml` keeps only the cache rules, under a comment saying why —
  moving the security headers back there silently disables them.
- `tests/headers.spec.ts`, PROTECTED, asserting on delivered responses. The
  equivalent block in `smoke.spec.ts` was removed rather than duplicated.

**Verified on the deploy: 7/7 pass.** `/ar`, `/en`, `/fr` and `/admin` all carry
the full set; static assets stay `immutable`; the no-flash script still runs.

**One finding worth keeping.** The CSP test failed on its first deploy run with
a real violation — Netlify's preview widget trying to frame `app.netlify.com`,
correctly blocked by `default-src 'self'`. That is the policy working on markup
we do not ship. The test now ignores _framing_ violations naming netlify.com and
nothing else: a blocked script, style or font still fails it, including from
that origin.

Local `next start` does apply `headers()` (unlike `netlify.toml`), so unlike
plan 1 this is locally checkable — which is why the CSP could be verified
against the full suite before pushing.

**Build status:** tsc clean · lint clean · build passes · 66 passed, 14 skipped
locally · 7/7 header tests on the deploy.

**Next:** Task 2 — the `/ar` CLS regression.

---

## Task 2 — the Arabic CLS regression, and what actually caused it

**The diagnosis was wrong in plan 1, and the real cause was worse.**

It was not simply that `preload: false` makes faces arrive late. Arabic had **no
working fallback at all**. next/font generates one automatically, and for
Tajawal it emits `src: local(Arial)` — and Arial has no Arabic glyphs. Arabic
text skipped straight past that carefully adjusted face to whatever system
Arabic font existed, with metrics the adjustment was never computed for.
Measured on the real hero string: matching Tajawal's width against that fallback
would need `size-adjust: 143.30%`. A 43% error, on every Arabic page, since
plan 1 task 9.

`adjustFontFallback: false` does not suppress it on Next 16 — verified against a
clean build with `.next` and `node_modules/.cache` both removed.

**What changed**

- Tajawal is **self-hosted**. The six subset files are the exact ones next/font
  was already serving, copied out of the build output, so the bytes on the wire
  are unchanged: **55.6 KB on `/ar`, 84.9 KB on `/en`** — identical to plan 1.
- `'Tajawal Arabic Fallback'` with an Arabic-capable `src` list and overrides
  derived from Tajawal's own metrics, not guessed.
- The hero face — and only the hero face — is preloaded on `/ar`, via
  `ReactDOM.preload`. A hand-written `<link>` emitted two copies, because React
  hoisted its own alongside ours.

**Measured on the deploy, three runs each**

|             | before (plan 1)       | after                        |
| ----------- | --------------------- | ---------------------------- |
| CLS `/ar`   | 0.059 / 0.062 / 0.000 | **0.0013 / 0.0000 / 0.0013** |
| LCP `/ar`   | 1.65 / 6.33 / 6.89 s  | **1.51 / 2.57 / 1.59 s**     |
| Performance | 91 / 70 / 67          | **94 / 93 / 100**            |

Same preview environment, same contamination in both columns, so the difference
is attributable to the fix. **Median LCP went from 6.33 s to 1.59 s.** The
earlier reading that blamed Netlify's preview instrumentation for the long tail
was only half right — our own font swap was doing most of it.

**The test is the point.** It throttles every woff2 response by 1.2 s, because
without that a local run cannot reproduce this class of bug at all: localhost
serves fonts before anything has painted. That is exactly why plan 1 measured
0.0000 and shipped 0.059. Confirmed to fail on `/ar` before the fix and pass
after.

The per-locale font test now counts both `/_next/static/media` and `/fonts`, and
asserts **exactly one** preload on Arabic and zero on latin — so preloading
everything fails as loudly as preloading nothing.

**Build status:** tsc clean · lint clean · build passes · 72 passed, 14 skipped ·
JS unchanged at 236.1 KB.

**Next:** Task 3 — the content store.

---

## Task 3 — content store

`src/lib/content` exposes `getProjects()` and `getSettings()`, cached and tagged
`content` so the public routes stay SSG between edits and a write can invalidate
them with `revalidateTag`.

Every read falls back to the bundled catalogue on every failure path: missing
blob (what a first deploy looks like), cold store, outage, or a stored value
that fails the schema. Nothing throws, nothing returns an empty array to signal
a problem. Writes are the opposite — they validate and throw, because a rejected
save with a visible error beats a silently corrupted store.

`whatsappUrl` is derived in the schema transform rather than stored, so it
cannot drift from `whatsappNumber`.

**One finding in the bundled data:** `ml-scores` carries `link: ''` to mean "no
live link". The schema normalises empty to absent rather than rejecting it — the
UI already treats it as falsy and an empty `<input>` posts the same value. The
alternative was editing the owner's data to satisfy a schema.

8 schema tests. tsc clean, lint clean, build passes.

---

## Task 4 — auth primitives

- `verifyPassword` — argon2id, constant-time, **fails closed** on a missing or
  malformed hash. The test that matters most: an unset `ADMIN_PASSWORD_HASH`
  must not read as "no password required", which is exactly what a naive
  `stored === candidate` does when both sides are undefined.
- `createSession` / `verifySession` — `jose` HS256, 8h expiry, fails closed on
  no token, bad signature, wrong claim, another secret, or no `AUTH_SECRET`.
- `SESSION_COOKIE_OPTIONS` — HttpOnly, Secure, SameSite=Strict, exported as one
  object so no future write can drift on them.
- Rate limit — 5 failures / 10 min / IP, 15 min lockout, Blobs-backed. **Fails
  open** on a store error, deliberately: the password is the gate, and a Blobs
  outage locking the owner out of their own panel is a self-inflicted denial of
  service an attacker cannot trigger.
- `proxy.ts` guards `/admin/*`, documented in the file as a first pass and not
  the security boundary — every action re-verifies its own session.

**`scripts/gen-admin-secrets.mjs`** generates both values, prompts with no echo,
writes `.env.admin.local` (gitignored, mode 0600) and **prints nothing secret**.
Verified: piped and interactive paths both work, stdout contains no argon2 hash
and no base64 blob, and `git check-ignore` confirms the output file and
`tests/.auth/` are ignored.

`@node-rs/argon2` installed and smoke-tested on this machine — hash, verify-true
and verify-false all correct, so the `@noble/hashes` fallback is not needed yet.

10 auth tests. 108 passed, 14 skipped overall.

**Next:** Task 5 — login page and session lifecycle.

---

## Running the admin locally — read this before hitting the wall

**Netlify Blobs only exists inside a Netlify runtime.** Under `npm run dev` or
`next start` there is no store, so:

- **Reads work.** Every read falls back to the bundled catalogue, which is why
  the dashboard lists all 7 projects locally.
- **Writes fail.** Create, edit, reorder and delete all return _"The content
  store is unavailable. Netlify Blobs only runs inside Netlify — use
  `npx netlify dev`, or edit on the deploy."_ That message is the expected
  behaviour, not a bug.

```bash
npx netlify dev      # full CRUD locally, Blobs sandbox included
npm run dev          # reads only — fine for design and layout work
```

Credentials live in `.env.local` (gitignored), generated by
`node scripts/gen-admin-secrets.mjs` — add `--random` if the prompt has no TTY,
which is the case when it is run through a tool rather than a terminal. Both
`.env.local` and `.env.admin.local` hold the **base64** of the argon2 hash; a
raw hash is destroyed by dotenv expansion (see task 5's note).

---

## Tasks 5 & 6 — login and the projects dashboard

Shipped and working locally: `/admin` login, `/admin/dashboard` with the project
list, reorder, edit and delete behind a confirmation. Both re-verify the session
independently of the proxy. Writes use `updateTag`, not `revalidateTag` — Next
16's `revalidateTag` with a profile is stale-while-revalidate, so the next
visitor would still see the old content.

**Two traps found by running it rather than assuming it worked:**

1. **`.env` files silently destroy an argon2 hash.** `@next/env` runs
   dotenv-expand over every `.env`, and a hash is `$argon2id$v=19$m=…` — each
   `$name` expands to nothing. Plain, double-quoted, single-quoted and
   backslash-escaped forms are **all** mangled; there is no quoting that
   survives. Netlify's dashboard does no expansion, so a raw hash works in
   production while every local login fails. `ADMIN_PASSWORD_HASH` now holds
   base64; both forms are accepted.
2. **The interactive prompt needs a TTY.** Run through a tool it gets empty
   stdin, and writing a blank credential would be worse than refusing. Hence
   `--random`.

**Design status: rejected by the owner, and fairly.** Default serif headings, a
flat table, no spacing rhythm, and raw image-path textareas in the edit form.
Task 10 is re-scoped from "UX polish" to a real design pass, and tasks 7 and 8
now build on its primitives. Two layout directions are with the owner; nothing
further is being built until one is picked.

**Next:** owner picks a layout direction, then tasks 7, 8 and 10.

---

## Tasks 7, 8, 10 — the admin, rebuilt in direction B

Owner picked **B, "Stack"**: one centred column, media-forward rows, editing
expands in place at full column width. `ProjectsTable` and `ProjectForm` were
deleted rather than edited.

- `ui/primitives.tsx` + `ui/Toaster.tsx`: one vocabulary — Button (four
  variants, all seven states), IconButton with a required label, Field wiring
  label/hint/error through `aria-describedby`, Section, Badge, Skeleton,
  EmptyState, and toasts that are `aria-live` and never steal focus.
- **Media is thumbnails, never paths.** Drop zone, grid, drag reorder _plus_
  arrow buttons (drag-only locks out keyboard users), × to remove with an undo
  toast rather than a confirm dialog, ★ to set the cover. Removing the cover
  promotes the next image instead of leaving a project pointing at an image it
  no longer has.
- Uploads: magic-byte sniffing that ignores filename and client MIME, sharp
  re-encode to WebP at four widths — which is what strips EXIF, a security
  property not an optimisation — LQIP at upload time, immutable media route.
- Settings: Contact / Social / Hero, `wa.me` URL shown as derived read-only text.
- Editor: Identity / Content / Media / Link, locales as tabs with a filled dot
  per language, danger zone bordered and separated from Save, unsaved-changes
  guard.

**The serif was an omission, not a choice.** The admin set no font variables, so
`font-sans` resolved through `var(--font-sans, var(--font-arabic))` — both
undefined in that tree — and fell to the browser serif default. Both variables
now bind to Inter, so even `font-display` resolves to Inter there.

Fixing that immediately broke a protected test, correctly: with `preload: true`
Next emitted the admin's Inter on the **public** Arabic route. Same behaviour
plan 1 task 9 measured. `preload: false` on that face.

---

## Task 9 — the public site reads the store

`page.tsx` reads `getProjects()` and `getSettings()` once and passes them down.
Projects takes the list; Hero takes the stats and the availability badge; Header,
Contact, Footer and FloatingWhatsApp take the derived WhatsApp URL; Footer
renders the admin's social links when there are any.

**`/[locale]` is still SSG** — confirmed in the build output, which is the point
of the `unstable_cache` wrapper.

**Verified with no store at all:** `/ar` and `/en` both render 7 project cards
and the full hero, no console errors. Every test in the suite already exercises
this path, since local runs have no Blobs runtime.

**Two things caught while verifying, both real:**

1. The hero's third figure would have started reading **14+** — the fallback
   derived it from `TECH_STACK.length` — where the live site says **10+**. That
   is published copy, so it is now `SITE.stacksCount = 10` and editable from the
   admin rather than silently rewritten.
2. **`unstable_cache` entries persist in `.next/cache`, which Netlify restores
   between builds.** A change to the _bundled fallback_ does not invalidate
   them, so a stale value survives a deploy — locally the stacks fix changed
   nothing until `.next/cache` was deleted. The cache keys now carry a
   `CACHE_VERSION` to bump when the fallback moves. Runtime writes were never
   affected; they call `updateTag` and expire immediately.

**Next:** Task 11 — secret audit and bundle isolation.

---

## Task 11 — secret audit and bundle isolation

No source changed. One new `test.describe` in `tests/smoke.spec.ts`, and this
block.

**Secret audit — clean, and the greps are recorded so they can be re-run**

| Check                                                                                        | Result                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_` other than `NEXT_PUBLIC_SITE_URL`                                             | none                                                                                                                                       |
| assigned `ADMIN_PASSWORD_HASH` / `ADMIN_PASSWORD` / `AUTH_SECRET` in tracked files           | test fixtures in `tests/auth.spec.ts`, the plan document, and the generator writing into the gitignored `.env.admin.local`. No real value. |
| `.env*` tracked by git                                                                       | `.env.example` only, all values empty                                                                                                      |
| `argon2` / `AUTH_SECRET` / `ADMIN_PASSWORD` in `.next/static/`                               | clean                                                                                                                                      |
| `jose` / `@netlify/blobs` / `blobStore` / `verifyPassword` / `md-session` in `.next/static/` | clean — no server-only module reached a client chunk at all                                                                                |

**Bundle isolation — the constraint is MISSED by 1.2 KB, and here is exactly why**

Plan 2's global constraint says the admin "must not add a single byte to the
public page's first load," and the expected figure was 236.1 KB. Measured:

| Build                                         | `/ar` first-load JS, gzipped | chunks |
| --------------------------------------------- | ---------------------------- | ------ |
| current `feat/v2`                             | **237.3 KB**                 | 12     |
| identical tree with `src/app/(admin)` removed | **236.1 KB**                 | 11     |

So the admin does cost the public page 1.2 KB. The plan says find it before
shipping, so it was found rather than rounded away.

It is **not admin code**. Two independent checks:

1. The admin's UI copy (`Discard unsaved changes?`, `No projects yet`, the
   category/frame helper text) appears in exactly two chunks,
   `38pohi52w09tp.js` and `3jr__l5mn6xbh.js`, and `/ar` references neither.
2. Uncompressed, the same 11 vs 12 chunk sets are **786,200 vs 786,349 bytes** —
   a difference of **149 bytes**, which is Turbopack's registration preamble for
   one additional chunk.

149 bytes of real code becomes 1,229 bytes on the wire because gzip compresses
each chunk independently: an extra chunk boundary is an extra dictionary reset.
Adding a second client entrypoint changes how Turbopack splits the shared graph,
and the public page pays the compression overhead of the finer split.

**Recommendation: accept it.** The only ways to recover 1.2 KB are to merge the
admin into the public chunk graph — which is the failure this constraint exists
to prevent — or to delete the admin. Recording 236.1 KB would have been the
easy, false answer; 237.3 KB is the number, and the constraint is stated as
missed rather than reinterpreted.

**The test, and its red-green**

`admin bundle isolation`, PROTECTED, three tests. It reads every `script[src]`
the public page loads, fetches each one, and asserts none contains admin-only UI
copy — string literals rather than identifiers, because a minifier renames
identifiers and leaves literals alone. Plus: no public locale links to `/admin`.

The plan proposed `expect(await page.content()).not.toContain('/admin')`. That
was not implemented as written, deliberately: it inspects the hydrated DOM, not
the delivered JavaScript, so it would pass on a build that shipped the entire
dashboard to every visitor. It is also a bare substring match on a string
common enough to false-positive.

Red-green verified rather than assumed: adding
`data-red-green="Discard unsaved changes?"` to `islands/FloatingWhatsApp.tsx`
and rebuilding failed the test on both `/ar` and `/en`; reverting turned it
green. A test that has never been seen to fail is not a gate.

**Found while measuring, not fixed here**

- **`measure-bundle.mjs` reports `Fonts (0 referenced) — 0.0 KB` on `/ar`.**
  It only counts `/_next/static/media`, and Tajawal has been self-hosted under
  `/fonts` since task 2. This is the harness biasing a number downward, which is
  the exact failure `scripts/port.mjs` was written to stop. The e2e suite counts
  both locations and is unaffected. Carried into task 12, where the font figures
  get re-stated.
- **`npm audit` is now 15, not 12** — 12 high (`sharp`/libvips, `next`'s bundled
  copy) plus 3 moderate: postcss `GHSA-6g55-p6wh-862q` and
  `GHSA-r28c-9q8g-f849`, also reached through `next`. Top-level `sharp@^0.35.3`
  is above the vulnerable range; only `next/node_modules/sharp` is flagged.
  `npm audit fix --force` still proposes `next@9.3.3`. Documented, not applied.

**Build status:** `npx tsc --noEmit` clean · `npm run lint` clean, zero warnings
· `npm run build` passes, `/[locale]` still SSG · `npm run test:e2e`
**148 passed, 14 skipped**.

**Next:** Task 12 — deploy verification and documentation.

---

## Task 12a — documentation, and a measurement bug it uncovered

Task 12 has two halves. This is the half that does not need a deploy. The four
verification steps are listed at the end and are **not done**.

**`scripts/measure-bundle.mjs` was lying about fonts, and had been all plan**

It reported `Fonts (0 referenced) — 0.0 KB` on `/ar`. The scan looked for
`/_next/static/media/*.woff2` in the HTML, and since task 2 the Arabic faces are
self-hosted under `/fonts` and discovered through `@font-face` rules in CSS, so
the HTML mentions only the single preloaded face. Every font figure quoted for
`/ar` during plan 2 came from the e2e suite instead, which is why nothing
downstream was wrong — but the harness itself was reporting zero for 55.7 KB of
transfer. That is the same failure class `scripts/port.mjs` exists to prevent: a
number that is silently wrong in the flattering direction.

Scanning the stylesheet would have been worse, not better. `globals.css`
declares all six Tajawal faces on every route and `/en` downloads none of them,
so a static CSS scan swings the error the other way. Only the browser knows
which declared faces a page uses, so the script now loads the page in chromium
and counts what it actually fetches.

| Route | Before this fix  | After           | Cross-check                          |
| ----- | ---------------- | --------------- | ------------------------------------ |
| `/ar` | 0.0 KB (0 files) | **55.7 KB** (6) | 55.6 KB recorded in plan 1           |
| `/en` | 84.8 KB (2)      | **84.8 KB** (2) | unchanged — latin was never affected |

`/ar` also reports 1 preloaded face and `/en` 0, matching the e2e assertion.

**Documentation, verified against the code rather than against the brief**

`README.md`:

- **§2** — `npm run lint` is `eslint .` on ESLint 9 flat, not `next lint`. Node
  is **20.9+ required**, not "18+ recommended". Added the scripts that existed
  but were undocumented: `test:e2e`, `test:headers`, `format`, both measurement
  scripts, `gen-admin-secrets`.
- **§4/§5** — the admin tree, `src/lib/{content,auth,images}`, `api/media`,
  `robots.ts`, `public/fonts`, the five new spec files, `.env.example`. Plus the
  two architectural decisions behind them: content from a tagged, cached store
  with the bundled data as fallback, and the admin as a second root layout.
- **§7** — Tajawal is self-hosted with a hand-written metric-matched fallback.
  The old text credited `next/font/google` for all three families.
- **§9** — **`dangerouslyAllowSVG` is not in `next.config.mjs`.** Checked rather
  than assumed: it is absent, and the README describing it as "enabled and
  fenced" was stale. Recorded as removed, with a note not to reintroduce it.
- **§11 (new)** — the admin panel and content store: the two content paths and
  why the bundled files are not dead code, `npx netlify dev` vs `npm run dev`,
  credential generation, the base64 hash trap, and the security model.
- **§12** — `robots.ts` **exists**; the README and MIGRATION both still listed it
  as missing. OG images, JSON-LD and `sitemap.ts` remain open, and the SEO
  category is still genuinely unverified behind the preview's `noindex`.
- **§13** — `adjustFontFallback` no longer credited; task 2 proved it does not
  suppress the bad generated fallback on Next 16. Font figures corrected to the
  freshly measured 55.7 / 84.8 KB.
- **§14** — the header split, with the reason stated so it does not get "tidied"
  back into `netlify.toml`, plus the env-var table and the `unsafe-inline` note.
- **§15** — the cookbook's "add a project = edit `projects.ts` then `gen:blur`"
  is no longer the mechanism. Both paths are documented, and the fallback path
  now says to bump `CACHE_VERSION`, which the old recipe would have missed.
- **§16** — five gotchas added, each one a defect that actually shipped.

`MIGRATION.md`: §4 rewritten from "open issue" to closed with the 7/7 result;
§6 gains the admin variables and the dotenv-expand trap; §7's verification table
and audit figures updated; §8 turned into a status table for the deferred items;
new §9 (what plan 2 delivered, including the 1.2 KB miss) and §10 (what still
needs a deploy).

**Two corrections to the brief, both verified before writing**

- `robots.ts` was described as outstanding. It shipped in task 5.
- `dangerouslyAllowSVG` was described as "still enabled per README §9". It is
  not in the config; only the README was stale.

**Carried through, unchanged in substance**

- **CSP `script-src 'unsafe-inline'`** — still the one loose directive, and
  `/admin` exists now. Recommendation is stated in the handoff, not silently
  left.
- **`npm audit` is 15, not 12** — 12 high (`sharp`/libvips) plus 3 moderate
  (postcss), all through `next`'s bundled copies. Still no fix short of
  `next@9.3.3`.
- **B16 and B17** are `tsconfig`'s `noUncheckedIndexedAccess` and the flat
  ESLint + `typescript-eslint`/jsx-a11y setup (spec lines 82–83). Both were
  **closed by plan 1 task 13**, which never cited the numbers — hence their
  apparent absence from this log. Nothing outstanding.

**Build status:** tsc clean · lint clean, zero warnings · build passes,
`/[locale]` still SSG · `npm run test:e2e` **148 passed, 14 skipped**.

---

## Task 12b — deploy verification

Branch pushed (`7fa7ae9`), preview rebuilt and green:
https://deploy-preview-1--medmoudsite.netlify.app

**Step 2 — the header suite: 7/7 pass.**

Including the two `/admin` tests that task 1 recorded as expected-red until the
admin existed. `/ar`, `/en`, `/fr` and `/admin` all carry CSP, HSTS, nosniff,
`Referrer-Policy` and `Permissions-Policy`; static assets stay `immutable`; the
no-flash script still runs under the policy. Nothing was weakened to get here.

**Step 3 — CLS on the deploy, three runs.**

| Route | plan 1 (the defect)   | now                          |
| ----- | --------------------- | ---------------------------- |
| `/ar` | 0.059 / 0.062 / 0.000 | **0.0000 / 0.0000 / 0.0000** |
| `/en` | 0.000                 | 0.0004                       |

Zero shift entries recorded on `/ar` on all three runs. Task 2's fix holds on a
real deploy, which is the only place this defect was ever visible.

**Steps 1 and 4 — NOT VERIFIED, and stated as such.**

`ADMIN_PASSWORD_HASH` and `AUTH_SECRET` are not set in Netlify (owner action,
task 4 step 10). Without them no sign-in can succeed, so the full admin flow and
the rate-limit lockout could not be exercised. They are not "probably fine" —
they are untested on a deploy.

Note that this cannot be detected from outside, and that is the auth working as
designed: `verifyPassword` fails closed on a missing hash, so an unset variable
and a wrong password are indistinguishable to a client. Do not read a rejected
login on the preview as evidence either way.

What _was_ verified without credentials:

| Probe                  | Result                                                   |
| ---------------------- | -------------------------------------------------------- |
| `GET /admin`           | 200, `x-robots-tag: noindex, nofollow, noindex`          |
| `GET /admin/dashboard` | **307 → `/admin`** — the proxy guard works on the deploy |
| `GET /robots.txt`      | 200, allows `/`, disallows `/admin` and `/api/`          |

The doubled `noindex` is ours plus Netlify's own preview header. Harmless, and
it disappears on production where only ours applies.

**One real defect found while probing, not fixed here.**

`robots.txt` advertises `https://medmoudsite.netlify.app/sitemap.xml` and that
URL **404s** — on the preview and on the live site. `robots.ts` was written in
task 5 pointing at a sitemap that plan 2 was never going to generate. It is
harmless in the sense that no crawler is misled about content, but it is a
broken reference in a file whose entire job is telling crawlers the truth.
`sitemap.ts` is plan 3 work (the rest of B13); this is one more reason it should
not slip.

**Still unverified after all of plan 2, and only production can settle it:**

- **Lighthouse SEO.** The preview carries `X-Robots-Tag: noindex`, so its score
  of 66 is an artifact and says nothing. Re-run after merge.
- **LCP.** `MIGRATION.md` §2 has never resolved this against a clean target.
- Steps 1 and 4 above, once the two environment variables exist.

**Owner action outstanding:** two verification form submissions from
2026-07-28 15:52 UTC still need deleting from Netlify → Forms → contact.

**Plan 2 is complete**, with tasks 12b steps 1 and 4 explicitly outstanding on
the owner's side rather than silently skipped.

---

## Task 12c — login verified, and the two upload bugs behind it

Closes 12b step 1. Step 4 (the rate-limit lockout) is still unexercised.

### Login works on the preview

`ADMIN_PASSWORD_HASH` and `AUTH_SECRET` **did not exist on the project at all**
— `getEnvVars` returned `[]` for every deploy context. They had been entered in
the dashboard but never saved, so 12b's "not set" note was still accurate. Set
via CLI as secrets, scoped `builds,functions,runtime`, in `production`,
`deploy-preview` and `branch-deploy`. Owner confirmed sign-in on
deploy-preview-1.

The scope matters as much as the context and is easy to lose: a Netlify secret
must be assigned explicit contexts _and_ scopes, and the Next.js server runs as
a **function**. Builds-only would have looked identical from outside — a hash
missing at request time and a wrong password are the same "Incorrect password."
by design.

Two things this cost time and are worth not rediscovering:

- **`console.log` from the Next.js handler never reaches Netlify's function log
  stream.** Only the platform's own `Duration:` lines appear. The build log is
  not exposed through the public API either (404). Neither is a usable debugging
  channel on this stack — an error has to come back in a response.
- Netlify records **several client IPs for one person** (three in one session,
  all AWS Frankfurt), which is its own entry below.

### B19 — uploads stored the string `[object SharedArrayBuffer]`

**Every upload that reported success wrote 26 bytes of text under every media
key.** `store.set` accepts `string | ArrayBuffer | Blob` and stringifies
anything else. On the Netlify Linux runtime sharp's output Buffer is backed by a
`SharedArrayBuffer`; `.slice()` preserves that type and the `as ArrayBuffer`
cast asserted it away, so the value fell through to `String()`. Every stored
blob had an identical ETag and served `200 image/webp`.

Local sharp returns a plain `ArrayBuffer`. The code was correct on Windows and
wrong on the deploy, the cast stopped the compiler objecting, and no local test
could have caught it. `toArrayBuffer` now copies element-wise into a fresh,
unshared, exactly-sized buffer; the tests construct the shared case by hand.

### B20 — uploads over ~1 MB failed silently

Three limits disagreed:

| Limit                           | Was     | Now       |
| ------------------------------- | ------- | --------- |
| `serverActions.bodySizeLimit`   | 1 MB    | 5 MB      |
| `MAX_UPLOAD_BYTES` / UI copy    | 5 MB    | 3.5 MB    |
| Netlify buffered binary request | ~4.5 MB | unchanged |

Over the framework limit the request is rejected **before the action body
runs**, so `uploadImage` never returns `{ ok: false }` — the call _rejects_.
`MediaGrid` had no `try/catch`, so it escaped through `Promise.all` into an
un-awaited `void upload(…)` and the row span "Uploading…" for ever. Measured on
the preview: 3.41 MB → `502`, 17.3 MB → `413`, neither reaching the UI.

Netlify's ceiling is the real one: 6 MB buffered, base64 on the way in, so
~4.5 MB of actual file. 5 MB was never deliverable. 3.5 MB now sits below both
and is the limit that reports.

### B21 — `.jfif` was never a sniffer problem

JFIF _is_ the ordinary JPEG container, so `.jfif` bytes always matched the
`FF D8 FF` branch. What rejected it was the file input's `accept` list, which
filters by the MIME the **operating system** maps an extension to — a mapping
full of holes. On the machine this was found on, `.jfif` → `image/jpeg` but
`.webp` and `.avif` → nothing at all, so the precise list was graying out real
WebP files too. `accept` is now `image/*` and `sniffImageType` is the only thing
deciding.

### Verified on deploy-preview-1, through the real admin UI

Driven with Playwright against the deployed preview, checking `naturalWidth`
rather than element count — counting `<img>` elements is what let B19 past a
first pass.

| Upload               | Result                                                                   |
| -------------------- | ------------------------------------------------------------------------ |
| `small.jpg` 0.15 MB  | uploaded, decodes 1600px                                                 |
| `small.png` 0.69 MB  | uploaded, decodes                                                        |
| `small.webp` 0.16 MB | uploaded, decodes                                                        |
| `small.jfif` 0.15 MB | uploaded, decodes                                                        |
| `mid.jpg` 3.41 MB    | uploaded, decodes — previously a silent `502`                            |
| `over-limit` 4.19 MB | refused client-side: "4.2 MB — the limit is 3.5 MB."                     |
| `huge.jpg` 17.3 MB   | refused client-side: "17.3 MB — the limit is 3.5 MB."                    |
| `nonimage.png`       | "not a JPEG, PNG, WebP or AVIF image — the contents are what is checked" |

Stored blobs re-fetched and decoded with sharp: real WebP at the expected
dimensions. Probe project and its 28 blobs deleted afterwards.

### B22 — OPEN: the rate limiter's IP key is not stable per user

`x-nf-client-connection-ip` gave **three distinct addresses for one person in a
single session**. `checkRateLimit` keys on it, so five attempts per ten minutes
is effectively five _per address_ — the ceiling is however many addresses the
CDN routes someone through. The lockout is far weaker than it reads, and 12b
step 4 has still never been exercised.

Not fixed here, deliberately — it needs a design decision, not a patch. The real
fix is to stop keying brute-force protection on client identity, since the admin
is a **single account**: count failures against the account itself, in one blob,
with the lockout applying globally. That makes the limit exact and unspoofable.
Its cost is that anyone can lock the owner out by failing five times, so it
needs a second factor the attacker does not control — a longer window with
exponential backoff rather than a flat lockout, and a bypass the owner holds.
An IP key can stay as a secondary, narrower limit, never as the only one.

### Still outstanding

- **The rest of the admin CRUD flow is unverified.** Create, edit, reorder,
  delete and settings have not been exercised on a deploy; only login and
  uploads have. The owner will test now that uploads work.
- Task 12b step 4 — the rate-limit lockout, unexercised, and see B22.
- Everything under "Still unverified after all of plan 2" above.

---

# Fixed per-platform social fields

Spec: `docs/superpowers/specs/2026-07-29-social-links-design.md`.

The admin's generic "Add social link" list is gone. Eight named platform
fields replace it — WhatsApp, Email, LinkedIn, GitHub, Instagram, Facebook,
TikTok, X — and the public site renders them as a **Contact** group of wide
pills and a **Follow** group of icon tiles, in the footer and the contact
section.

## What changed

- **`src/lib/social.ts`** (new). The closed platform set in render order, and
  the single source of truth for the admin form, the schema and the public
  components. Each entry carries a placeholder, an error message, and
  `toStored`/`toHref`/`toDisplay`. `toStored` returns the canonical value or
  `null`, and `null` is the only validation signal — the live preview in the
  admin and the check on save run the same function, so they cannot disagree.
- **`src/components/SocialIcons.tsx`** (new). Six brand marks from Simple
  Icons (CC0), inline single-path SVG, no dependency. WhatsApp and Mail reuse
  the existing exports in `Icons.tsx`.
- **Storage.** `email` moved out of `SITE` and into settings so it is editable;
  `SITE.email` is now the seed in the blob fallback. `socials` went from
  `{platform, url, label}[]` to an object keyed by the six follow platforms.
- **`whatsappNumber` is now optional**, like every other field. `Header` and
  `MobileDrawer` fall back to `#contact` (and drop `target="_blank"` when they
  do), `Hero` drops its WhatsApp button, `FloatingWhatsApp` renders nothing.
- **Per-field errors.** `Result` gained `fieldErrors`, keyed by input name.
  Every zod issue lands under the field that caused it instead of the first
  one becoming a page-level banner.
- **`updateSettings` no longer zips three `getAll` arrays by index.** Each
  platform posts under its own name, so a row's URL can no longer land against
  another row's platform.

## Two deliberate behaviour changes

Both had tests asserting the old behaviour; both tests were rewritten.

1. **An `http://` social link is upgraded, not rejected.** The host is checked
   against that platform's own domains first, so an `http://github.com` link is
   known to be GitHub. Project `link` fields still reject http — that rule is
   untouched, and the reasoning there (an arbitrary client site) does not apply
   to a known social host.
2. **A WhatsApp number with punctuation is normalised, not rejected.**
   `+222 31-31-75-01` stores as `22231317501`.

## Icon budget

Measured path bytes: X 147, Instagram 264, Facebook 286, LinkedIn 429,
TikTok 597, GitHub 712. All under the 1 KB bar; 2,435 bytes total.

Instagram is the one mark not taken verbatim — the official path is 1,489
bytes, almost all of it squircle corner geometry that is invisible at the 20px
these render at. Replaced with the same camera glyph on plain 5px/3px arcs.

## Verified locally

`npx tsc --noEmit` clean · `npm run build` clean, `/ar` `/en` `/fr` still
prerendered · **`npx playwright test` 230 passed, 14 skipped** (the deploy-only
header tests).

New coverage: 16 normalisation cases across all eight platforms (bare handle,
full URL, wrong platform, `javascript:`, junk, empty), the legacy array→object
migration including the `twitter`→`x` alias and an unknown platform, blank
fields on every platform, and one bad field producing exactly one issue against
exactly its own path. Plus `tests/social.spec.ts`: both pills in both regions
across all three locales, the follow block absent when nothing is published,
and the phone number's `<bdi dir="ltr">` isolation under `/ar`.

Rendering was checked against a temporarily seeded fallback — all eight filled,
`/ar` and `/en`, footer and contact, light and dark. The seed was reverted; the
committed fallback publishes WhatsApp and Email only.

**Two layout bugs found that way and fixed:**

- The footer's connect column was `1fr` of `[1.5fr_1fr_1fr]` — 293px against
  the ~320px six 44px tiles need, so the last tile wrapped onto its own line in
  both locales. Column widened to `[1.2fr_0.8fr_1.4fr]`.
- The Email pill's label wrapped to two lines in Arabic, where «البريد
  الإلكتروني» is far longer than «واتساب», making it taller than the WhatsApp
  pill beside it. The label now holds its line and the value truncates.

RTL confirmed on `/ar`: tiles read right-to-left with LinkedIn rightmost, the
pill mark sits on the right, and `+22231317501` reads in stored order.

## Not verified here — the owner's preview pass

The admin form itself has not been seen rendered: it needs a login, and
credentials were not shared. Everything below needs a deploy.

### Checklist

On the deploy preview, signed in, **Settings** tab:

1. Eight rows are present in two groups — Contact (WhatsApp, Email) then
   Follow (LinkedIn, GitHub, Instagram, Facebook, TikTok, X). Every row shows
   its logo, its name, an input, and a line underneath. Empty rows read
   "Not published." and are **not** errors.
2. Existing links survived the migration: whatever was in the old list is
   already filled into its platform's row.
3. Type a **bare handle** into GitHub (`baycheikh`) — the line underneath
   becomes `Link: https://github.com/baycheikh` as you type.
4. Type an `@handle` into TikTok and into X — same, resolving to
   `https://tiktok.com/@…` and `https://x.com/…`.
5. Paste a **twitter.com** URL into X — it resolves to `x.com`.
6. Paste a **GitHub** URL into the Instagram row — the line reads "Not a link
   yet." Press Save: the error appears **under that row**, not at the top, and
   nothing else is lost. Correct it; the error clears as you type.
7. Fill all eight, Save. Toast says "Settings saved."

Then on the public site, for `/ar`, `/en` and `/fr`, in **both** the footer and
the contact section, in **both** dark and light:

8. Two pills: WhatsApp green, Email in the violet→cyan brand gradient. Each
   shows logo + name + the actual value.
9. Six tiles under a separate "Follow" heading, rounded squares, logo only.
10. On `/ar`: the phone number reads `+222…` and is **not** reversed; the mark
    sits on the right of each pill; tiles read right-to-left.
11. Every tile is reachable by keyboard and announces its platform name.

Then:

12. Clear **two** fields — say Facebook and TikTok — and Save. Those two tiles
    vanish with no gap and no placeholder left behind.
13. Clear **all six** follow fields and Save. The entire Follow block goes,
    heading included.

Report what you saw and this section gets updated from it.

## The one pre-existing lint error, now fixed

`npm run lint` reported one error in `tests/images.spec.ts:168`
(`@typescript-eslint/no-base-to-string`): `String(out)` on an `ArrayBuffer`,
which has no meaningful `toString`.

The assertion wanted the object tag — `[object SharedArrayBuffer]` is the exact
string that got written to every media key — so it now reads that tag
explicitly via `Object.prototype.toString.call(out)`. Same assertion, no
implicit stringification. `npm run lint` is clean across the repo.

---

# Plan 3 — pre-build investigation

Nothing was built in this block. Two questions were answered before touching the
hero, because building a heavier hero on top of an unexplained LCP fault hides
the fault rather than fixing it.

## CORRECTION: the `<h1>` "2.3 s element render delay" is not a fault

`MIGRATION.md` §2 carried this from plan 1 as an open, unexplained defect. It is
not one. **Do not chase it.** Full measurements and the ruled-out hypotheses are
in `MIGRATION.md` §11; the short version:

`2.3 s` was **LCP minus TTFB**, and for a text LCP with no image that is just
time-from-first-byte-to-first-paint — there is no resource to load, so there is
no resource phase to blame. Naming it an "element render delay on the `<h1>`"
attributed a whole-document cost to one element. In 4 of 7 runs on `/en` the
`<h1>` _is_ the FCP element.

Ruled out with evidence: the old `opacity: 0` reveal (gone), font blocking
(`document.fonts.ready` at ~550 ms; the `<h1>` paints before its webfonts
finish), main-thread blocking (first long task lands _after_ LCP), the inlined
RSC payload (all 21 `__next_f.push` scripts sit after the `<h1>`), and byte
position (7,356 B between header and `<h1>` = 35 ms at 1.6 Mbps).

It is CPU. Same network, only the CPU rate changed:

| Route | CPU  | median LCP − TTFB |
| ----- | ---- | ----------------- |
| `/ar` | 4×   | 1750 ms           |
| `/ar` | none | 549 ms            |
| `/en` | 4×   | 1402 ms           |
| `/en` | none | 490 ms            |

**Two consequences for the hero work.** Run-to-run variance exceeds 1 s under
identical conditions, so A-vs-B must be compared on medians over **≥7 runs** or
the comparison is noise. And the bottleneck is main-thread time rather than
bytes, which is worse for three.js than its KB figure suggests.

## B23 — a statically prerendered route is served by a function, and cold-starts at 6.5 s

**Not fixed in plan 3. Logged so it is not forgotten.** This is the largest real
LCP risk on the site and it dwarfs anything the hero will do: a cold `/ar` was
measured at **TTFB 6506 ms** against **~370 ms warm**, an 18× spread on a route
the build reports as SSG (`● /[locale]`).

**Evidence.** `/ar` responds with `Cache-Control: public,max-age=0,must-revalidate`
and a `Netlify-Vary` listing 8 headers, 3 cookies and 2 query parameters. That is
the Next.js runtime function answering, not a plain CDN static hit. The build
output also lists `ƒ Proxy (Middleware)`.

**Hypothesis, in confidence order.**

1. **The proxy matcher is over-broad, and this part looks like plain
   misconfiguration.** `src/proxy.ts` has only two jobs — redirect exactly `/`,
   and guard `/admin/*` — but its matcher is
   `'/((?!api|_next/static|_next/image|favicon.ico|.*\..*).*)'`, which also
   matches `/ar`, `/en` and `/fr`. Every locale page therefore involves a Node
   runtime function invocation whose only outcome is `NextResponse.next()`. A
   matcher of `['/', '/admin/:path*']` would express the same two jobs and take
   the locale routes out of the function path entirely.
2. **`Netlify-Vary` fragments the cache.** Each distinct combination of those 13
   vary keys is its own cache entry, so a first request against any unseen
   combination misses and pays a cold start. This is emitted by
   `@netlify/plugin-nextjs` and is structural to the runtime rather than ours.

**Untested, and stated as untested:** narrowing the matcher was not tried, so it
is not proven that doing so removes the cold TTFB. Hypothesis 1 is a
misconfiguration and is cheap to test; hypothesis 2 is not ours to configure. The
honest position is that (1) is very likely contributing and may not be the whole
story.

**Also still open from plan 2:** `robots.txt` advertises a `sitemap.xml` that
404s. Both belong to the SEO pass, not here.

---

# Plan 3 — the hero, the motion, the palette

Concept A of the three metaphors offered was chosen: **one blueprint, two frames**
— a single luminous lattice bent twice, once into a wide viewport and once into a
phone, with the fold continuous and the grid pitch shared so it reads as one
surface seen from two angles rather than two objects. A site and an app as two
views of one system, which is the offer, stated without a caption.

Both technical versions were built and both are live on the preview.

## The palette

Charcoal near-black base, violet bleeding into electric blue as the accent and
light source. Designed as a token set, not lifted from a catalogue — the 21st.dev
theme catalogue was checked and has effectively one entry.

The substantive decision is that there are now **three gradients, not one**,
because a gradient's stops depend on what sits on it:

| Token set       | Duty                                     | Stops                                         |
| --------------- | ---------------------------------------- | --------------------------------------------- |
| `--brand-1/2/3` | gradient **text** on the page background | light tints on charcoal, dark shades on paper |
| `--pill-1/2/3`  | gradient **surfaces** under white text   | dark in both themes                           |
| `--glow-1/2`    | the hero's single light source           | vivid; never behind text at strength          |

Only `--brand` inverts role between themes, and it inverts _role_, not values —
light mode stays a genuine second palette (cool paper, not flipped charcoal).

Measured contrast, all AA:

| Pair                                       | Ratio |
| ------------------------------------------ | ----- |
| dark `--fg` on `--bg`                      | 17.01 |
| dark `--muted` on `--bg`                   | 7.49  |
| dark accent `#A78BFA` on `--bg`            | 7.18  |
| light `--fg` on `--bg`                     | 16.68 |
| light accent `#6D28D9` on `--bg`           | 6.69  |
| `--fg` over the glow at its worst frame    | 10.85 |
| `--muted` over the glow at its worst frame | 4.78  |

The worst frame was checked rather than the average, per the brief: the glow's
strongest point behind text is `#332A6B`, and both foregrounds clear AA on it.

**Two WCAG failures fixed, both pre-existing.** White on WhatsApp green measured
**1.98:1** — a plain AA failure on the site's most prominent contact control, and
below even the 3:1 bar for the floating button's non-text mark. WhatsApp green is
a fixed brand colour, so the foreground moved instead: charcoal on the same green
is **9.86:1** and the green stays recognisable, which a darker green would not.
The Email pill was on the _text_ ramp at **3.68:1** and is now on the pill ramp at
**5.17:1** at its lightest stop.

`btn-gold` stopped hardcoding its own violet-to-indigo hexes and uses the pill
ramp. It and the Email pill had independently reached the same decision, and two
copies of one decision is how they drift apart.

## Concept weight, gzipped

|                              | chunk        | vs target                             |
| ---------------------------- | ------------ | ------------------------------------- |
| **A1** raw GLSL, no three.js | **3.1 KB**   | target was 15 KB — came in at a fifth |
| **A2** three.js + r3f        | **229.0 KB** | 74x A1                                |

A2's chunk is within 10 KB of the site's entire first-load bundle, for a
decorative background layer.

**First-load JS is 238.5 KB either way** — byte-identical with A2 present and
absent, so three.js is genuinely code-split and shipping the switch costs a
visitor who never types `?hero=a2` nothing. That is what makes deploying both
honest rather than a tax on the default. Against the 236.1 KB baseline the whole
hero adds **2.4 KB** to first load, all of it the host island.

## Runtime, measured on the deploy preview

Nine runs per cell, 390x844, 4x CPU throttle, slow 4G (1.6 Mbps / 150 ms),
medians. Every URL warmed first — B23 makes a cold hit 6.5 s of TTFB, and one
cold run inside a set moves the median by seconds.

Only runs where the intended concept actually engaged are counted, verified per
run via `data-hero-layer`. All cells were 9/9; an earlier pass had a cell fall
back to the poster, which would have compared A1-with-a-canvas against
A2-without-one and made A2 look free.

| route | concept | runs used | LCP - TTFB | LCP     | FCP to h1 | CLS    | TBT        | JS transferred |
| ----- | ------- | --------- | ---------- | ------- | --------- | ------ | ---------- | -------------- |
| `/ar` | A1      | 9/9       | **746 ms** | 1012 ms | 0 ms      | 0.0009 | **87 ms**  | 195 KB         |
| `/ar` | A2      | 9/9       | **757 ms** | 1032 ms | 0 ms      | 0.0009 | **333 ms** | 411 KB         |
| `/en` | A1      | 9/9       | **666 ms** | 940 ms  | 0 ms      | 0.0004 | **75 ms**  | 195 KB         |
| `/en` | A2      | 9/9       | **686 ms** | 952 ms  | 0 ms      | 0.0004 | **292 ms** | 411 KB         |

`LCP - TTFB` is the comparable column: TTFB on these routes swings 20x with cold
starts and has nothing to do with the hero.

**Three things this says.**

1. **Neither concept touches LCP.** 746 vs 757 ms on `/ar`, 666 vs 686 on `/en` —
   an 11-20 ms difference, well inside the run-to-run spread. The animated layer
   loading after first paint is not a claim here, it is the measurement.
2. **`FCP to h1` is 0 ms on every cell.** The `<h1>` is the first contentful
   paint, and the canvas never displaces it as the LCP element.
3. **A2 costs ~4x the blocking time.** 333 ms against 87 ms on `/ar`, 292 against
   75 on `/en`. Main-thread time is this site's scarce resource (`MIGRATION.md`
   §11), and A2 spends it.

**A pre-hero control was measured with the identical harness**, against the
`5e2cd0d` deploy permalink, so the hero's cost is a difference and not an
assertion:

| route | build    | LCP - TTFB | TBT   | JS transferred |
| ----- | -------- | ---------- | ----- | -------------- |
| `/ar` | pre-hero | 749 ms     | 66 ms | 191 KB         |
| `/ar` | A1       | 746 ms     | 87 ms | 195 KB         |
| `/en` | pre-hero | 660 ms     | 65 ms | 191 KB         |
| `/en` | A1       | 666 ms     | 75 ms | 195 KB         |

**A1 costs 4 KB of transfer, ~15 ms of blocking time, and nothing measurable in
LCP.** That control also corrected a claim this session had already written down —
see the correction appended to `MIGRATION.md` §11.

CLS is 0.0009 / 0.0004 — the reserved box works; the canvas contributes no shift.

## Recommendation: ship A1, delete A2

A2 is the better-looking object. Extruded frames with an inner wall genuinely
catch the single light source, the fold foreshortens correctly in perspective
where A1's 2D shear is convincing head-on and wrong at the extremes, and depth
ordering lets the phone pass in front of the viewport. Those are real
differences, not marketing.

They cost 226 KB of extra transfer and quadruple the blocking time on the metric
this site is already worst at, for a layer nobody looks at directly. At a normal
viewing size the two are hard to tell apart in a still frame; the difference shows
up in motion, at the extremes of the fold, for a second or two per 26-second
cycle.

A1 hits every hard rule with room to spare and came in at a fifth of its own
budget. **Ship A1.** The honest answer to "what does the extra weight buy" is: a
better fold at the extremes, and nothing a client would notice.

## 21st.dev — surveyed, nothing retrieved

Four searches, ~36 components reviewed. **No retrievals spent**, on the reasoning
the owner accepted:

- A large share of the WebGL results are auto-generated by 21st.dev's own Shader
  Builder — identical boilerplate descriptions, four-colour presets, mesh-drift /
  aurora / silk variants. These are the gradient blobs the brief rules out.
- Nothing in the catalogue does Concept A. Every candidate is an ambient
  _background_ — dots, waves, blooms, gradients. A's geometry _is_ the idea, so
  that part was original work either way.
- Of the four shortlisted, only one states a licence: `paper-design/dot-grid`,
  Apache-2.0, adapted from Paper Shaders. The brief says write from scratch when a
  licence is not clearly permissive, which disqualifies the other three from being
  adapted at all. And the one that is licensed is public on GitHub, so its mount
  pattern needed no metered call.

Shortlisted and rejected, for the record: `paper-design/dot-grid` (licence clear,
wrong shape), `chamaac/grid-bloom` (closest mechanic, licence unstated),
`easemize/isometric-wave-grid-background` (closest geometry, canvas-2D, licence
unstated), `cult-ui/grid-beam` (reputable, licence unstated).

**Nothing was adapted from any of them.** Both concepts are written from scratch
against our tokens, our RTL rules and our bundle budget.

## Arabic and RTL

Designed Arabic-first, then checked against latin.

- The poster composition mirrors via `scaleX(-1)` on Arabic, asserted in tests for
  both directions.
- A1 mirrors **in shader space**, not with a CSS transform on the canvas:
  mirroring the element would also mirror the lighting, and the fold and its light
  source have to mirror together.
- A2 mirrors the fold, the light position and the depth offsets together.
- The stats row keeps its digits in reading order under Arabic — asserted, since a
  reversed run would render `+5`.

## Tests

30 new assertions across both device profiles, in `tests/hero.spec.ts`, covering
guarantees rather than looks: the headline renders without JavaScript and is not
inside the animated layer, its box is unchanged before and after the layer mounts,
every documented fallback engages with the right reason, the switch works, and the
composition mirrors. Suite is **260 passed, 14 skipped**.

Writing them found two real problems, one in the tests and one in the code:

- **In the tests.** `waitFor({ state: 'attached' })` resolves against the server
  HTML, where the layer host honestly reports `poster`/`ssr` because no browser API
  has been read yet. A one-shot `getAttribute` therefore reads `poster` whatever
  the device supports, and three of the four fallback assertions were passing for
  that reason rather than on their merits. They now use retrying matchers.
- **In the code.** The WebGL probe ran before the reduced-motion check, so a
  visitor who had asked for reduced motion on a machine without WebGL was told the
  reason was `no-webgl`. The preference now wins: it is the more truthful answer,
  it holds whatever the hardware supports, and such a visitor no longer pays for a
  probe that creates and destroys a real GL context to settle a question their
  preference has already answered.

## What was not done

- `sitemap.ts`, `robots.ts`, OG images and JSON-LD stay out, per the brief — a
  design change and an indexing change do not share a commit.
- B23 (the cold-start TTFB) is logged, not fixed.
- Lighthouse category scores are not reported. The preview carries
  `X-Robots-Tag: noindex`, which makes its SEO score an artifact, and the
  Performance number on a deploy preview is contaminated by Netlify's own
  instrumentation — `MIGRATION.md` §2 records both. The field metrics above are
  measured directly and are the honest substitute; a production Lighthouse run
  after merge is what settles the category scores.

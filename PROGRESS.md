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

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

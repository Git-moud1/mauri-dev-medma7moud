# Optimization report — 2026-10-16

Branch `cleanup/optimization-2026-10-16`. Every change is listed in `CHANGELOG.md`; this file
is the measurements and the reasoning.

## Baseline vs. final

| Measure                                                    | Baseline (`main` @ `8b7f761`)            | Final (this branch)                                              |
| ---------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| First-load JS, `/ar` (gzipped)                             | 241.1 KB, 13 chunks                      | **223.2 KB**, 12 chunks (−17.9 KB, −7.4%)                        |
| First-load JS, `/en/projects`                              | 239.7 KB                                 | **221.1 KB** (−18.6 KB)                                          |
| Fonts, `/ar` / `/en`                                       | 55.7 KB / 84.8 KB                        | unchanged                                                        |
| Lighthouse mobile, `/ar` (median of 3)¹                    | Perf 85 · A11y 100 · BP 100 · SEO 100    | **Perf 87** · A11y 100 · BP 93² · SEO 69²                        |
| — LCP / TBT / CLS                                          | 2.51 s / 389 ms / 0.001                  | **2.14 s / 366 ms** / 0.001                                      |
| Lighthouse desktop, `/ar`                                  | 96 / 100 / 100 / 100                     | 96 / 100 / 93² / 69²                                             |
| `npm audit`                                                | 22 (**1 critical**, 16 high, 5 moderate) | **9** (0 critical, 7 high, 2 moderate) — build-time tooling only |
| TypeScript / ESLint                                        | 0 errors / 0 warnings                    | 0 / 0                                                            |
| `npm run format:check` (Windows)                           | **fails** — 117 files                    | passes                                                           |
| `npm run build`                                            | passes, 29 s³                            | passes; 12–13 s warm, 60 s fully cold³                           |
| Runtime checks (local, real `next start` + Blobs emulator) | 86/86 on the previous code               | 86/86 on the final code                                          |
| Browser regression on the deploy preview                   | —                                        | 37/37 (+1 stale-baseline check, explained below)                 |
| Console errors on production pages                         | —                                        | 0                                                                |
| Broken internal links                                      | —                                        | 0 of 8                                                           |

¹ Production (old code) and the deploy preview (new code) were measured **interleaved**,
under the same CPU conditions. This laptop's speed varies a lot between sessions (Lighthouse
benchmark index 1,900–3,400), so only interleaved runs are comparable. Earlier one-off scores
are not.

² Preview-only effects, not caused by the code. Netlify adds `X-Robots-Tag: noindex` to every
deploy preview (SEO), and the site's CSP correctly blocks Netlify's preview-drawer iframe
(Best Practices). Production scores 100 on both, and will again after the merge.

³ Not comparable. The baseline was the first build after a fresh `npm ci`, a partly cold
cache.

## What changed and why

1. **Security — Next.js 16.2.12 → 16.4.2.** This was the important change. The audit's
   critical finding is unauthenticated remote code execution, including through the image
   optimizer with AVIF, and this site enables AVIF. It's a minor upgrade within 16; the
   release notes show nothing that touches this app's caching, server actions or proxy.
   Verified by the full runtime suites.
2. **sharp ^0.35.5.** Next 16.4 depends on the same line, so there is now **one** sharp.
   Two copies had made admin uploads fail in local Windows runs (`ERR_DLOPEN_FAILED`);
   that's gone with no workaround.
3. **The current dictionary only, client-side.** `I18nProvider` imported all three languages.
   Switching language already navigates to a server-rendered page, so the client never
   needed the other two. This is the bulk of the JS saving.
4. **Dead code.** Found by knip, confirmed by hand, removed only when nothing referenced it.
5. **LF line endings.** The committed code was already formatted. Windows checkouts turned it
   CRLF, and Prettier then flagged it, so `format:check` was useless on the owner's machine.
6. **README.** Several claims were wrong:
   - the live URL;
   - `npm run dev` "reads fine";
   - the missing OG images and sitemap (they shipped in July);
   - two content paths;
   - changing the password via Netlify.

   Five environment variables and a dozen files were undocumented.

## Checked and found already good

- Every `next/image` has `sizes`. Card, stage and thumbnail qualities are tuned, and AVIF/WebP
  are served by Netlify's Image CDN.
- The gallery lightbox and the three.js hero are code-split. The hero loads only after
  `load` and idle time.
- Fonts are self-hosted, `font-display: swap`, and only the active locale's faces load.
- Static assets and media have 1-year immutable caching (media also durable on the CDN).
  Content reads are cached and tag-invalidated, with no repeated network calls.
- No `console.log` or debug output in `src`, and no commented-out code blocks.
- Build output stays the same shape: content routes static (`●`), admin dynamic; the store
  namespace is still compiled in.

## Deliberately not changed

| Item                                                      | Why not                                                                                                                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remaining 9 audit findings                                | Build-time only (ESLint plugin; Tailwind 3's file-watching/globbing deps); never shipped or run on the server. Fixing needs **Tailwind 4** (config + styling migration) or a nonsensical ESLint-config "downgrade" the tool suggests. |
| `@netlify/blobs` 10 → 11                                  | Major version. The store code works around two measured 10.7.10 behaviours (`setJSON` ignoring conditions; SharedArrayBuffer bodies); 11 needs its own verification pass.                                                             |
| `motion` → lighter animation code                         | It is already behind `LazyMotion strict`, with drag/layout features in the lightbox's lazy chunk; a measured July decision. Removing it means rewriting animations, i.e. a redesign.                                                  |
| Async-loading motion features                             | Elements with an initial hidden state would stay hidden until the features download — a visible-content risk for a few KB.                                                                                                            |
| JS budget of 150 KB                                       | Not reachable without removing React/Next weight: React DOM + the Next.js runtime are ~110 KB of the 223 KB.                                                                                                                          |
| `skin-beauty/cover.jpg` = `skin-beauty/2.jpg` (identical) | Both are referenced by the live project record; deduplicating means editing content.                                                                                                                                                  |
| `server-only` not in `package.json`                       | Next resolves it internally; the build enforces it. Adding the package is optional.                                                                                                                                                   |
| knip's "unused files" in `scripts/`                       | Standalone CLI tools run by hand (backup, icons, mockups, measurement), not dead.                                                                                                                                                     |
| Exported-but-unused **types**                             | Harmless API surface. Removing them buys nothing at runtime.                                                                                                                                                                          |

## About the one "failing" preview check

The browser suite's last check compares production's content with the **13 October** backup,
to prove staging tests never write to production. The owner has since edited the projects
(a new "K.M" project, a new order). So the check now compares against stale data and fails by
design. Comparing production with **today's** verified backup instead shows it is
byte-identical (`projects.json`, `settings.json`, 58/58 images). Staging tests did not touch
production.

## Removed after review (owner's request)

Everything the site does not use, all still in git history:

- `public/projects/swift-eats/1–4.webp` (477 KB) and their templates in `scripts/mockups/swift-eats/`. The live Swift Eats project uses uploaded images.
- The planning and history documents: `PROGRESS.md`, `MIGRATION.md`, `New_CLAUDE_CODE_PROMPT.md`, `docs/plan-3-brief.md`, `docs/superpowers/`.
- `supabase/schema.sql`. Supabase is no longer used.
- An untracked screenshot in the project root (never committed).

## Recommended next steps

1. **PharmaNet's live link is down.** `https://phamanet.site.je` times out, and its DNS points to
   what looks like a parking service. Fix or remove the link in the admin.
2. **Search Console** for `https://mauri-dev.online`: verify it and submit the sitemap
   (`docs/OPERATIONS.md`).
3. **Tailwind 4 migration**, as its own project, to clear the remaining build-time advisories.
4. **`@netlify/blobs` 11**, with a verification pass of the two documented SDK behaviours.
5. **Restore an automated test suite in the repo.** The local runtime suites used for this work
   (content/admin, password change, reset) could be committed as a `test:local` script against
   `npm run blobs:local`.
6. Decide on a `LICENSE` (there is none, so all rights are reserved by default).

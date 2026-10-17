# Changelog

All notable changes to this project. Dates are when the change reached `main`.

## 2026-10-17 — The site speaks as the Mauri-Dev team

- The About section is now "Who We Are / من نحن / Qui sommes-nous": Mauri-Dev, a team of
  software engineers. No personal name remains.
- The hero, section labels, contact text and footer use "we" instead of "I" in all three
  languages.
- The structured data (JSON-LD) no longer has a Person node: the Mauri-Dev business is the
  publisher and creator. `SITE.altName` and `SITE.roleKey` are removed.
- The AURA and Pulse Analytics mockups show "Mauri-Dev" instead of a personal name
  (templates and the 4 affected WebP images regenerated).

## 2026-10-16 — Cleanup and optimization pass

Branch `cleanup/optimization-2026-10-16`. Measurements and reasoning are in
`OPTIMIZATION_REPORT.md`.

### Cleanup

- Removed dead code found with knip and confirmed by hand. Nothing called these:
  - the `ProjectRowsSkeleton` component;
  - the admin `Skeleton` and `Panel` primitives;
  - `SparkleIcon`, `getDict()` and `whatsappLink()`.
- Removed the 170-line bundled project catalogue from `src/data/projects.ts`. Nothing had read
  it since the content store replaced it; the `Project` types stay.
- Stopped exporting symbols used only inside their own module:
  - the social icons and `SOCIAL_PLATFORMS`;
  - the store-name constants;
  - the image-processing internals.
- Removed the upload limits' duplicate re-export.
- Line endings are LF on every platform (`.gitattributes`). `npm run format:check` used to
  fail on Windows with 117 files flagged, all from CRLF checkouts.
- Formatted the three documents Prettier flagged. The Search Console verification file is
  kept out of Prettier, because it must stay byte-exact.
- README brought in line with the code (see Fixes).

### Performance

- Only the current language's dictionary reaches the browser. All three used to ship in
  every page's first-load JS (~7 KB gzipped). Dictionary-free helpers now live in
  `src/i18n/translate.ts`.
- First-load JS on `/ar`: **241.1 → 223.2 KB gzipped**, 13 → 12 chunks. On `/en/projects`:
  239.7 → 221.1 KB.
- Lighthouse, mobile, median of 3 runs on the same CPU conditions:
  - Performance 85 → 87
  - LCP 2.51 → 2.14 s
  - TBT 389 → 366 ms

### Fixes

- **Security:** Next.js 16.2.12 had published unauthenticated remote-code-execution flaws,
  one of them in the image optimizer with AVIF, which this site enables. Upgraded to
  16.4.2.
- Local Windows runs no longer fail admin uploads with `Could not load the "sharp" module`.
  Next 16.4 uses the same sharp line as the app, so there is one install, not two.
- README:
  - live URL, features list, a quick start that actually works locally;
  - scripts, stack versions and the repository layout;
  - the complete environment-variable table;
  - SEO status, the single content path, the password workflow.
- `scripts/backup-blobs.mjs` crashed on Windows once the rate-limit store held keys containing
  `:`. Key segments are now escaped on disk, and `blobs:local` and `seed:staging` reverse
  the escaping. (Shipped to `main` just before this branch, commit `8b7f761`.)

### Dependencies

- `next` 16.2.12 → **16.4.2**; `eslint-config-next` 16.2.12 → 16.4.2. Both kept as exact pins.
- `sharp` ^0.35.3 → **^0.35.5**.
- `npm audit fix` applied the non-breaking transitive fixes.
- `npm audit`: **22 → 9** vulnerabilities (critical 1 → 0, high 16 → 7, moderate 5 → 2). The
  remaining 9 are all build-time tooling, not shipped or run on the server:
  - the Next ESLint plugin;
  - Tailwind 3's chokidar/braces/micromatch/postcss-selector-parser.

  Fixing them needs Tailwind 4 or a major ESLint-config change.

### Removed

- Unused files, all still in git history:
  - `public/projects/swift-eats/1–4.webp` (477 KB, no longer referenced) and
    `scripts/mockups/swift-eats/`;
  - `PROGRESS.md`, `MIGRATION.md`, `New_CLAUDE_CODE_PROMPT.md`, `docs/plan-3-brief.md`,
    `docs/superpowers/`;
  - `supabase/schema.sql`.
- Dead exports and components listed under Cleanup.
- The bundled catalogue data in `src/data/projects.ts`.

## 2026-10-12 → 2026-10-16 — Outage recovery

Full record: `docs/RESTORATION-LOG.md`. In short:

- **Content store:** moved back from the vanished Supabase project to Netlify Blobs, and all
  14 broken images were restored.
- **Admin password:** can be changed from the dashboard, or recovered by email through
  Resend.
- **Contact form:** moved from Netlify Forms to Resend, with an archive in Blob storage.
- **Custom domain:** `mauri-dev.online` on Netlify DNS with HTTPS. The old Netlify address
  redirects to it.
- **Operations:** backups, staging isolation and the runbook (`docs/OPERATIONS.md`).

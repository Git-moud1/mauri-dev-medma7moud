# Restoration log — 2026-10

Checkpoint for the October 2026 outage recovery. Newest entry last. Detail lives in
README §11; this file records what happened and what is verified.

## Outage (diagnosed 2026-10-12)

- Supabase project `eglcgjliyrvymelhawjn` vanished from DNS between 2026-08-19 and 2026-08-22
  (NXDOMAIN on every public resolver). Every keep-alive run from 2026-08-22 failed with curl
  exit 6 (host not resolvable) — the workflow was a symptom, not the cause. Paused vs deleted
  was never established; nothing in the recovery depends on it.
- Public pages kept serving Netlify's cached render of 2026-08-08; every `/api/media/*` image
  (14 references, 3 projects) returned 404, and no deploy could build.
- A home Wi-Fi router (192.168.100.1) returns SERVFAIL for `*.netlify.app` while public
  resolvers answer — a network DNS fault, separate from the outage.

## Data recovered

- Netlify Blobs still held the pre-Supabase copy: `site-content` (9 projects + settings,
  identical to the 2026-08-08 render) and `site-media` (all 14 referenced images, every
  width). Read-only copies, SHA-256 manifests: `Desktop\MYW1-recovery-2026-10-12`,
  `Desktop\MYW1-backups\production-*`.
- 11 contact-form submissions exported from Netlify Forms (personal data — kept private).
- Not recoverable and unused by any feature: Supabase's `created_at` / `updated_at` columns
  (they held the 2026-08-08 migration time, not creation dates). Not invented.

## Architecture (decided 2026-10-12)

Netlify Free + Netlify Blobs + Netlify Forms. Vercel Hobby forbids commercial use; Turso Free
archives databases after 10 days idle; Firebase Storage needs the paid Blaze plan.

## Branch `fix/blobs-store`

- Content and media back on Netlify Blobs; Supabase and the keep-alive workflow removed.
- No store read at build time (`generateStaticParams` → `[]`); pages render on first request.
- Conditional + read-back-verified writes; per-form version stamps against stale tabs.
- Store prefix compiled from Netlify `CONTEXT`: production `''`, previews `staging-`, else `local-`.
- Admin password change, forgot/reset by email (Resend adapter; outbox on non-production).
- Local verification: 55/55 content/admin checks, 33/33 auth checks (local Blobs emulator,
  real `next start`, Playwright Chromium).

## Staging (2026-10-13)

- PR #3, deploy-preview-3. Staging stores were seeded from the production backup and are
  checksum-identical to it.
- Staging suite on the Netlify runtime: **49/49 on two consecutive deploys**. It covers:
  - public pages in all 3 locales, with text identical to the pre-outage page
  - all 14 recovered images at every width, plus all static images
  - filters, every gallery, theme toggle, mobile layout and menu
  - the contact form
  - every settings field: persistence, and live update without a redeploy
  - project create, edit, image replacement, reorder and delete
  - password change, emailed reset (outbox) and single-use links
  - production stores unchanged afterwards
- Logout and cookie flags (HttpOnly, Secure, SameSite=Strict) checked separately.
- Persistence across deploys: the second deploy signed in with the password set during the
  first deploy's tests.
- Contact-form test messages land in Netlify's Spam folder (headless browser + example.com);
  they are deleted after each run. Spam also holds 11 older submissions (March–April 2026),
  exported to `MYW1-backups/forms-2026-10-13`. They are worth reviewing.
- Lighthouse, mobile, `/ar`, median of 3 runs:

  |             | Old production | Preview |
  | ----------- | -------------- | ------- |
  | Performance | 87             | 91      |
  | TTFB        | 1224 ms        | 676 ms  |
  | TBT         | 354 ms         | 216 ms  |
  | CLS         | 0.001          | 0.001   |

  Desktop scores 95 on both. The preview's SEO 69 and Best Practices 93 come from Netlify's
  preview-only `noindex` header and its preview drawer.

- The hero animation (three.js, ~760 KB) now loads after the `load` event and idle time.
- Operations, rollback, DNS findings and custom domain steps: `docs/OPERATIONS.md`.

## Open items

- `RESEND_API_KEY` — needs a Resend account opened with the recovery address (owner action).
- `mauri-dev.online` — not delegated at the `.online` registry; registration/DNS is the owner's.

## Production release (2026-10-13)

- Checkpoint: tag `pre-restore-2026-10-13` (old `main`), old published deploy `6a77c2ca`.
  Verified backup `MYW1-backups/production-2026-10-13T10-17-23-729Z` taken immediately before.
- PR #3 merged as `bb482aa`. Production deploy `6ace068b` is live at
  https://mauri-dev.netlify.app (now https://mauri-dev.online, which it redirects to).
- Read-only smoke test: **19/19**. That covers:
  - 9 projects in order in all 3 languages
  - content identical to the pre-outage page
  - 28/28 uploaded image files and 34/34 static images served byte-identical
  - no broken image on screen
  - admin, forgot and reset pages load
  - the dashboard redirects without a session
- Production stores: `admin-auth` and `auth-attempts` are still empty, so the admin password
  is unchanged (the `ADMIN_PASSWORD_HASH` bootstrap). Forgot password answers "not
  configured" until `RESEND_API_KEY` is set.
- Lighthouse after release (desktop): 96 / 100 / 96 / 100. Mobile runs on the measuring laptop
  dropped to 69–75 for both production and the identical preview, because the host CPU
  benchmark fell from ~3350 to ~1900 between sessions. The valid same-CPU before/after pair
  is above (87 → 91). The remaining mobile TBT is the hero's three.js start-up. It now runs
  after load, and removing it on phones would change the approved design.

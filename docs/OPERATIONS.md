# Operations

Everything here costs nothing: Netlify Free, Netlify Blobs, and Resend Free (contact-form
emails and password resets — 100/day, 3,000/month). There is no keep-alive job and nothing that
needs one.

## Backups

```bash
npm run backup:blobs                     # production → ../MYW1-backups/production-<timestamp>/
npm run backup:blobs -- --prefix staging-   # the preview stores
```

- **Read-only.** It only runs `netlify blobs:list` and `blobs:get` (Netlify CLI, logged in, linked to the site).
- **Covers** `site-content`, `site-media`, `auth-attempts` and `admin-auth`.
- **Writes `SHA256SUMS.txt` last.** A folder without it is an unfinished backup.
- **When:** after every session of admin edits, and before every production deploy.

Verify a backup at any time:

```bash
cd ../MYW1-backups/production-<timestamp> && sha256sum -c SHA256SUMS.txt
```

Two backups taken with no admin edits in between should have identical `SHA256SUMS.txt`
content.

**Personal data.** A backup holds the admin password hash, the reset-token hash and the
login-attempt records (IP addresses). Contact-form messages are exported separately into the
`forms-*` folders. Keep backups on your own disk or private cloud storage — **never in the
repository, which is public**.

## Restore

1. **Inspect first, locally:**
   ```bash
   npm run blobs:local -- --seed ../MYW1-backups/<backup>
   ```
   Then start the app with the printed variable and check the site and the admin.
2. **Restore one document to production.** Only what is actually wrong, one key at a time:
   ```bash
   netlify blobs:set site-content projects.json --input ../MYW1-backups/<backup>/site-content/projects.json
   ```
   Images are immutable and never overwritten by the app, so they only need restoring if
   deleted by hand:
   ```bash
   netlify blobs:set site-media <key> --input …
   ```
3. **Make the site show it.** Save any setting once in the admin. That calls `updateTag`, so
   the public pages pick up the restored data. A redeploy also works: the page cache is
   deploy-scoped.
4. **Take a fresh backup** and compare its checksums with the one you restored from.

## Release checklist (production)

1. `npx tsc --noEmit && npm run lint && npm run build` — all clean.
2. The PR's deploy preview passes the staging suite. Previews use `staging-*` stores and can
   never touch production data.
3. `npm run backup:blobs` with a verified `SHA256SUMS.txt`.
4. Note the current production deploy ID. Netlify → Deploys → the one marked _Published_.
5. Merge the PR into `main`. Netlify builds and publishes production (15 credits).
6. Smoke test (read-only):
   - `/ar`, `/en`, `/fr` and the `/projects` pages
   - every `/api/media/*` image
   - `/admin` loads, and `/admin/dashboard` redirects when signed out

## Rollback

- **Code:** Netlify → Deploys → the previous deploy → **Publish deploy**. Instant and free.
  Alternatively `git revert` the merge and push.
- **Data:** a code rollback never changes Blob data. Restore from a backup as above if data
  itself went wrong.
- **Note:** the pre-restoration production deploy (`6a77c2ca`, August 2026) depends on the
  deleted Supabase project. Publishing it brings back the broken images. It is a last resort
  only.

## Netlify Free credits (300 per month, hard cap)

When credits run out, **every site on the account is paused** until the next month.

| Item                             | Cost                   |
| -------------------------------- | ---------------------- |
| Production deploy                | 15 credits             |
| Deploy previews / branch deploys | free                   |
| Bandwidth                        | 20 credits per GB      |
| Requests                         | 2 credits per 10,000   |
| Compute                          | 10 credits per GB-hour |

- **Check:** Netlify → Team → Usage & billing, about once a week. Act at 50 % used before
  mid-month.
- **Save credits:**
  - Batch changes into fewer production deploys. Content edits through the admin need **no**
    deploy.
  - Test on deploy previews instead.
  - Images are already served with a durable CDN cache.

## Troubleshooting

| Symptom                                                | Cause / fix                                                                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public page shows a 500 error                          | A content document is missing or invalid. The function log names `site-content/projects.json` or `settings.json`. Restore it from a backup.                       |
| Admin shows "content store is unreachable"             | Same as above, or a preview whose `staging-*` stores were never seeded: `npm run seed:staging -- --from <backup>`.                                                |
| "Sign-in is unavailable right now"                     | `admin-auth/credential.json` is unreadable or malformed. Restore it, or delete it to fall back to `ADMIN_PASSWORD_HASH`.                                          |
| Forgot password says "not configured"                  | `RESEND_API_KEY` is not set in Netlify (Functions scope).                                                                                                         |
| Reset email never arrives                              | Without a verified domain, Resend delivers only to its own account address. Check the account email and the function log (`[auth] password reset email failed`).  |
| A contact message never reached Gmail                  | Look in the `contact-messages` store (`npm run backup:blobs`), then the function log (`[contact] could not email`). Check Resend usage: 100/day on the free plan. |
| "Could not load the sharp module" (local Windows only) | Start with `NEXT_SHARP_PATH=<repo>/node_modules/sharp`. Not an issue on Netlify.                                                                                  |
| Site works on mobile data but not on one Wi-Fi network | Network DNS. See below.                                                                                                                                           |

## Wi-Fi / DNS (diagnosed 2026-10-12/13)

The site never failed on Netlify's side. Observed from the home Wi-Fi network:

- **Router (`192.168.100.1`):** returned **SERVFAIL** for `mauri-dev.netlify.app` on
  2026-10-12, while resolving `google.com`, `github.com` and `app.netlify.com` normally. On
  2026-10-13 it answered 10/10.
- **Public resolvers from the same network:**
  - `8.8.8.8` answered 10/10.
  - `1.1.1.1` failed 7/10, so the network itself mishandles some DNS traffic.
  - Cloudflare DoH always answered.
- **Conclusion:** an intermittent fault in the router's or ISP's DNS path. **No application
  change can fix it.**

**Workarounds on affected devices:**

- Set DNS to `8.8.8.8` / `8.8.4.4`.
- Or turn on Private DNS / DoH:
  - Android: Settings → Private DNS → `dns.google`
  - Windows: DNS over HTTPS
  - Chrome: Secure DNS

**Router fix:** in the router's settings, replace the ISP's DNS with `8.8.8.8` / `8.8.4.4`.

A custom domain does not fix a broken resolver. It does remove the dependence on how a given
resolver treats `*.netlify.app`, which some networks filter.

## Custom domain `mauri-dev.online`

**Status on 2026-10-13:** the `.online` registry answers NXDOMAIN, meaning the domain is not
registered or has no nameservers. Registration is the owner's action. Once it is registered:

1. **Add the domain in Netlify:** Domain management → Add a domain → `mauri-dev.online`, and
   add `www` as an alias. Free, with automatic Let's Encrypt SSL.
2. **At the registrar, do one of:**
   - **Easiest:** point the nameservers to Netlify DNS. Netlify shows four `dns*.p0*.nsone.net`
     names.
   - **Or keep the registrar's DNS** and add:
     - `A @ 75.2.60.5` (Netlify's load balancer — confirm the value Netlify shows)
     - `CNAME www mauri-dev.netlify.app`
3. Set `mauri-dev.online` as the **primary domain**. `mauri-dev.netlify.app` then redirects
   to it with a 301.
4. Set `NEXT_PUBLIC_SITE_URL=https://mauri-dev.online` in Netlify (production) and redeploy.
   Canonical URLs, the sitemap, OG cards and password-reset links follow automatically.
5. **Search Console:** add the new property, submit `https://mauri-dev.online/sitemap.xml`,
   and set `GOOGLE_SITE_VERIFICATION`.

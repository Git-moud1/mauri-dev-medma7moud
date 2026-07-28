# Lighthouse baseline — live site, 2026-07-28

The "before" column for `MIGRATION.md`. Measured against the **live Next 14
site**, `https://medmoudsite.netlify.app/`, which is still what visitors get —
`feat/v2` is not deployed.

Lighthouse 13.4.1, mobile form factor, simulated throttling, headless Chrome.

| Category       | Score |
| -------------- | ----- |
| Performance    | 96    |
| Accessibility  | 100   |
| Best Practices | 96    |
| SEO            | 100   |

| Metric                   | Value     | Target   |
| ------------------------ | --------- | -------- |
| Largest Contentful Paint | **2.7 s** | < 2.0 s  |
| Cumulative Layout Shift  | 0         | < 0.05   |
| Total Blocking Time      | 40 ms     | < 200 ms |
| First Contentful Paint   | 1.1 s     | —        |
| Speed Index              | 2.7 s     | —        |

Raw report: `lh-live-baseline.json` (git-ignored — regenerate with the command
below).

```bash
npx -y lighthouse https://medmoudsite.netlify.app/ \
  --form-factor=mobile --screenEmulation.mobile \
  --throttling-method=simulate --output=json \
  --output-path=./docs/superpowers/baseline/lh-live-baseline.json \
  --chrome-flags="--headless=new --no-sandbox" --quiet
```

## What this changes about the brief's premises

The brief opens with "the site is noticeably slow on first visit". The scores do
not show a slow site in aggregate — **only LCP is out of budget**, at 2.7 s
against a 2.0 s target. TBT is 40 ms and CLS is already 0. So the work that
matters is whatever delays the largest element painting, not general
heaviness.

## Image widths — the `w=3840` question, settled

Measured separately on the same live site with a real Pixel 7 viewport
(412×915, DPR 2.625), scrolling the full page:

| Requested width | Count |
| --------------- | ----- |
| 96 px           | 1     |
| 750 px          | 4     |
| 1200 px         | 3     |
| **3840 px**     | **0** |

8 optimized requests, 243.2 KB total, at `q=70` and `q=75`.

**No browser downloads the 3840 candidate.** It is the widest entry in the
`srcset`, and the candidate a browser picks comes from `sizes` plus the device's
own width and DPR — never from the largest entry available. The multi-megabyte
first load the brief suspected here does not happen.

The two real first-load costs were the ones plan 1 went after: 111 KB of fonts
loading on every route regardless of locale, and ~183 KB of JS from the entire
component tree being client-side.

This probe must be repeated against the deploy preview before plan 1 can be
called verified — the new `sizes` attributes could regress it, and a regression
here would be invisible in a byte total.

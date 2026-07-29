# Fixed per-platform social fields

**Date:** 2026-07-29 · **Branch:** `feat/v2`

Replace the admin's generic "Add social link" list with a fixed set of eight
named platform fields, and render them on the public site as two groups.

## Why

The generic list let the owner type any platform name, any URL and any label.
Nothing tied a row to how it rendered, three free-text fields could disagree
with each other, and `updateSettings` reassembled the rows from three parallel
`formData.getAll` arrays — an index-alignment hazard with no schema behind it.

Eight fixed fields remove all of that: the platform set is closed, the label is
derived, and the URL is normalised from whatever shape the owner types.

## The platform set

Fixed, in this order. `group` decides where it renders.

| Key         | Group   | Input accepted             | Canonical form                 |
|-------------|---------|----------------------------|--------------------------------|
| `whatsapp`  | contact | digits incl. country code  | `https://wa.me/<digits>`       |
| `email`     | contact | email address              | `mailto:<address>`             |
| `linkedin`  | follow  | full profile URL           | the URL, normalised            |
| `github`    | follow  | username or full URL       | `https://github.com/<user>`    |
| `instagram` | follow  | username or full URL       | `https://instagram.com/<user>` |
| `facebook`  | follow  | full URL (share links too) | the URL, normalised            |
| `tiktok`    | follow  | `@handle` or full URL      | `https://tiktok.com/@<handle>` |
| `x`         | follow  | `@handle` or full URL      | `https://x.com/<handle>`       |

Every field is optional and always shown in the admin, empty included. Empty
means "not published" — never an error.

## Architecture

### `src/lib/social.ts` — the registry

One ordered array is the single source of truth. The admin form, the zod
schema and the public components all read from it; adding a platform later is
one entry, not a change in four files.

Each entry carries `key`, `group`, `placeholder`, and `normalise(raw)`, which
returns a canonical URL or `null` for unparseable input. `null` is the
validation signal — there is no second validator to keep in step.

The module must stay client-safe (no server imports): the admin form calls
`normalise` on every keystroke to render the live link preview, and zod calls
the same function on save. Preview and stored value therefore cannot disagree.

### Storage — `src/lib/content/types.ts`

`whatsappNumber` stays top-level and unchanged. Five consumers already read the
derived `settings.whatsappUrl` (`page.tsx`, `Header`, `Hero`,
`FloatingWhatsApp`, `Footer`); renaming it buys nothing. Its existing
digits-only regex is exactly the WhatsApp field's validation.

Two changes:

- **`email`** — new top-level optional string. Previously hardcoded as
  `SITE.email` and not editable. `SITE.email` becomes the seed default in the
  blob fallback, so a cold store still publishes an address.
- **`socials`** — array of `{platform, url, label}` becomes an object keyed by
  the six follow platforms, each an optional canonical URL.

Existing stored data is migrated by a `z.preprocess` on `socials`: an array
input is folded into the object by matching each entry's `platform`
case-insensitively against the known keys, taking its `url`. Unrecognised
platforms drop. Nothing needs a manual migration step, and a store already
holding the new object shape passes straight through.

### Admin — `SettingsForm.tsx`

The `Section title="Social"` block is replaced by two sections, Contact and
Follow, rendering the registry in order. All eight rows are always present;
`SocialDraft`, `moveSocial`, `nextKey` and the add/remove/reorder controls are
deleted along with it.

Each row is a `Field` containing the platform glyph, its name, and a
`TextInput`, with the resolved link underneath in the same style the WhatsApp
field already uses. `Field` already accepts an `error` prop, so per-field
errors need no primitive changes.

Inputs get distinct names (`email`, `social.linkedin`, …), which lets
`updateSettings` read each by name and retires the parallel-array parsing.
`Result` gains an optional `fieldErrors: Record<string, string>`; every zod
issue is mapped to its field rather than the first issue becoming one
page-level string.

### Public — `src/components/SocialLinks.tsx`

Two server components, mounted in both `Footer` and `Contact`:

- **`ContactPills`** — rounded-full pills, one per line: glyph, label, value.
  WhatsApp keeps `#25D366` with white text. Email uses the existing
  `bg-gold-grad` brand gradient — the site palette, not green.
- **`FollowTiles`** — a horizontal row of `rounded-2xl` tiles on `bg-surface`
  with `shadow-card`, glyph only, centred, each with an `aria-label`.

Entries with no stored value are filtered before render, so an empty field
produces no node — no gap, no placeholder tile. A group whose entries are all
empty renders nothing at all, heading included.

In `Contact` these replace the two hardcoded pills; in `Footer` they replace
the `socials.map` and the two hardcoded links.

### Icons — `src/components/SocialIcons.tsx`

Six new glyphs — LinkedIn, GitHub, Instagram, Facebook, TikTok, X — as inline
single-`<path>` SVGs on a `0 0 24 24` viewBox, taken from Simple Icons (CC0).
WhatsApp and Mail reuse the existing exports in `Icons.tsx`. A sibling file
rather than growth in `Icons.tsx` keeps the brand-mark licensing note in one
place. Named exports only, so unused glyphs tree-shake. No new dependency.

### Dictionaries

A new top-level `social` key in `en.ts` (the type source), mirrored
structurally in `ar.ts` and `fr.ts`:

```ts
social: {
  contact: 'Contact',
  follow: 'Follow',
  names: { whatsapp: 'WhatsApp', email: 'Email', linkedin: 'LinkedIn', … },
}
```

Platform names are keyed because they are translated — an Arabic pill reads
`واتساب · 48011609` — while the value beside them is not.

### RTL

- Values are wrapped in `<bdi dir="ltr">`, not a bare `dir="ltr"` span. `<bdi>`
  isolates, so a digit string adjacent to a separator cannot reorder the
  surrounding Arabic. The phone number must not reverse.
- Pills and the tile row use plain `flex`. The document's `dir="rtl"` mirrors
  them, putting the glyph on the right and reading tiles right-to-left. No
  `flex-row-reverse` anywhere — that would double-reverse.
- Spacing uses logical `ms-*`/`me-*`, matching `primitives.tsx`.

## Testing

Schema unit tests live in `tests/content.spec.ts` (Playwright is the only
runner in this repo, and already hosts the fallback-contract tests):

- `normalise` per platform: bare handle, full URL, junk, empty.
- The array→object migration, including an unknown platform.
- A cold-store fallback still satisfying the schema.

Rendering is covered end-to-end: filled entries appear in both footer and
contact section across `/ar`, `/en`, `/fr`; a cleared field leaves no node.

## Out of scope

The `## Fix while you're in there` heading in the brief was left in by mistake
and is empty. Nothing is folded in under it.

Deploy-preview verification is the owner's pass, not this branch's — admin
credentials are not shared. This work ships with local and code-level
verification plus a click-by-click checklist for the owner to run.

# Plan 3 — the hero, the motion, the palette

This is the owner's brief, recorded verbatim. It **replaces Phase 4 of
`CLAUDE_CODE_PROMPT.md` entirely**. Nothing of the old Phase 4 survives: not the
3D framing, not its budget, not its concept-count. If a future session finds the
two in conflict, this file wins.

---

## Context first

The previous session may have been cleared. `PROGRESS.md` is your memory — read
it before anything, along with `MIGRATION.md` and `git log --oneline -15`.
Branch is `feat/v2`. Run `/find-skills` and load what's relevant.

Do not start until the social-links work is confirmed live on the preview and
the owner has run the 13-step checklist. If that's still open, finish it first.

## What this plan is

Phase 4 of `CLAUDE_CODE_PROMPT.md` is superseded. Ignore it. This brief replaces
it entirely.

> I want a hero that stops people. Not a template, not a gradient with a headline
> on it — something a visitor screenshots. But I also know what it costs, and I'd
> rather find out with my own eyes than argue about it in the abstract.

## Build two concepts, deploy both, let the owner choose

Not mockups. Two working heroes, openable on the preview and switchable between.

**Concept A — raw GLSL, no three.js.** A hand-written fragment shader on plain
WebGL. Target 15 KB. This is where the best ratio of impact to weight is
expected, and 21st.dev has several zero-dependency shader heroes to learn the
technique from.

**Concept B — real 3D, three.js / react-three-fiber, cost accepted.** Build the
most striking thing possible. The point is to see what the extra weight actually
buys. This project already ships 236.1 KB against a 150 KB target — so measure
honestly and report the true delta, route by route.

Put both behind a switch that can be flipped on the deployed preview without a
rebuild — a query param is fine. Measure both: JS delta, LCP, CLS, Lighthouse,
on mobile throttling, on `/ar` specifically. One table.

## The palette — charcoal with a violet-blue glow

Near-black charcoal base, with violet bleeding into electric blue as the accent
and light source. Cold, technical, forward-looking.

Design it properly, as a token set — don't lift it from a catalogue. 21st.dev's
theme catalogue has effectively one entry in it, so there's nothing there worth
taking. Use the site for **component and motion technique**, not for colour.

Constraints:

- The dark palette is the default and gets the real design attention. Light mode
  must stay a genuine second palette, not an inversion — that's an existing
  invariant, don't break it.
- All text must clear WCAG AA against its actual background, including text
  sitting over the animated layer. Check the worst frame, not the average.
- The glow must not turn everything into the same purple soup. One light source,
  used sparingly.

If the new accent ripples into buttons, links, cards or the lightbox, carry it
through coherently rather than leaving a two-palette site.

## The motion must mean something

The offer is web and e-commerce sites **and** mobile apps — equally, both. The
hero animation should say that without a caption.

The metaphor is not prescribed; choosing it is the implementer's job. But it
should read as structure, building, connection, or things assembling into a
working whole — not as abstract decoration that could sit on any site in any
industry. Something that suggests a screen and a phone being two views of one
system would be closer than particles drifting.

Give 2–3 short written concepts for the metaphor **before building**, one
paragraph each. The owner picks, then both technical versions of the chosen idea
get built.

## Arabic and RTL are the primary case, not a port

Every component on 21st.dev is English and LTR. Arabic is this site's default.
So:

- Design the type for Tajawal and Arabic first, then check Latin.
- Do not use a component's Latin typography as-is. Arabic needs different
  optical sizing, line height and letter-spacing behaviour.
- Any directional motion — sweeps, reveals, parallax, entrances — must mirror
  correctly in RTL.
- Numbers in the stats row must not reverse. `<bdi dir="ltr">` where needed.

## Hard performance rules

These are not negotiable, whichever concept wins:

- **The animated layer is never the LCP element.** The `<h1>` paints first,
  independent of the canvas. There is an existing unsolved ~2.3 s element render
  delay on that `<h1>` on both v1 and v2 — do not make it worse, and report the
  cause if found along the way.
- No layout shift from the canvas. Reserve its box.
- `prefers-reduced-motion` gets a still, composed frame — not a broken layout,
  and not nothing. It should still look intentional.
- `navigator.connection.saveData` and low-end devices fall back to a static
  gradient or a pre-rendered image.
- The canvas pauses when off-screen and when the tab is hidden.
- No WebGL context on devices that can't take it — detect and fall back rather
  than shipping a black rectangle.
- The animated layer loads after first paint, never blocking it.

## Using 21st.dev

The MCP connection is available. Two things about it:

- **Search is free and unmetered.** Browse widely — components, motion patterns,
  hero structures. Look at many.
- **Fetching a component's code is metered: 2 per day, and the quota is shared
  with the owner's other sessions.** So shortlist from metadata and previews
  first, then spend a retrieval only on something actually going to be used.
  Report the shortlist and the reasoning before spending one.

Treat anything pulled as reference, not as a drop-in. It has to be rewritten for
our tokens, our RTL, our budget and our bundle rules. Attribute in `PROGRESS.md`
whatever was learned from or adapted.

Check the licence on anything adapted. If it isn't clearly permissive, write it
from scratch instead.

## Do not touch

- **The email stays.** The old instruction to strip `baymed000@gmail.com` from
  the site and the dictionaries is cancelled and stays cancelled. It's now a
  settings field with a contact pill. Leave it.
- The social links work (fixed per-platform fields, commit `549a61b`).
- The admin panel, the content store, the auth.
- The three defaults that must agree: `no-flash.tsx`, `DEFAULT_LOCALE`,
  `ThemeProvider`. Arabic + RTL + dark stay default.
- `blur.generated.ts` is generated, never hand-edited.
- `ar` / `en` / `fr` stay structurally identical, `en.ts` is the type source.
- Don't weaken a PROTECTED test.

## Not in this brief

The remaining SEO work — `sitemap.ts`, `robots.ts`, OG images, JSON-LD — is real
and still open, but it is out of scope here. It gets its own pass after the hero
lands, so a design change and an indexing change never share a commit.

## Process

1. Read the state. Report it back in 20 lines before writing code.
2. Give the 2–3 motion metaphors, written. Stop and wait.
3. After the owner chooses: browse 21st.dev, shortlist, report what would be
   retrieved.
4. Build both technical concepts. Small commits on `feat/v2`.
5. `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:e2e` clean
   after each step. Zero warnings, no `any`, no `@ts-ignore`.
6. Deploy, measure both, produce the table, recommend which to ship and why —
   including if the answer is that B isn't worth it.
7. Append to `PROGRESS.md` with measured numbers. State a missed target as
   missed.

Then stop. The owner picks the winner, the loser gets deleted.

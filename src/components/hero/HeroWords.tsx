'use client';

import { useEffect, useState } from 'react';

import type { Locale } from '@/i18n/config';
import { getT } from '@/i18n/server';
import { projects } from '@/data/projects';

import type { Direction } from './LatticePoster';

/**
 * A3's text overlay: what the parallaxed device actually is, plus a way down the
 * page.
 *
 * --- Why this is not a second headline -------------------------------------
 *
 * The reference hero this concept came from reveals its own `<h1>` word by word.
 * That cannot ship here, and not because of the placeholder copy: `Hero.tsx`'s
 * `<h1>` is server-rendered specifically so it paints with the document and is
 * usually the FCP element, and `hero.spec.ts` asserts that no `<h1>` lives inside
 * the animated layer. Repeating the headline over the canvas would either
 * duplicate the LCP text on screen or require hiding the server-rendered one
 * behind a lazily-loaded chunk — which is the exact regression plan 1 removed
 * when it deleted the `opacity: 0` entrance.
 *
 * So the reveal is kept and pointed at something that is not already on the
 * page: the name of the project *in the image*. The base texture is a real
 * screenshot of Swift Eats composited into a device, and labelling it is the
 * difference between "some phone" and a piece of work — which is the whole reason
 * a real app was used instead of an empty frame. The strings come from
 * `src/data/projects.ts`, so there is no fourth place to translate.
 *
 * Nothing here replaces an existing affordance, so if the A3 chunk never loads
 * the hero is exactly what A1 leaves behind.
 */

/**
 * FIX 4. Derived once per module load, not per render.
 *
 * The reference rebuilt `titleWords` on every render while listing only
 * `titleWords.length` in the effect's dependency array — so the effect could not
 * see the identity change it was actually receiving, and the array was garbage
 * every frame that anything else in the hero updated. There is one set of words
 * per locale and they are known at module scope.
 */
const SUBJECT_ID = 'swift-eats';

const WORDS: Record<Locale, readonly string[]> = (() => {
  const project = projects.find((p) => p.id === SUBJECT_ID);
  const build = (locale: Locale) =>
    (project?.title[locale] ?? '')
      .split(/\s+/)
      .filter((word) => word.length > 0 && word !== '—');
  return { ar: build('ar'), en: build('en'), fr: build('fr') };
})();

/** Milliseconds between successive words. */
const STEP_MS = 130;

/**
 * Reveals the words one at a time, in reading order.
 *
 * The order is the point. A reveal that always runs left to right is a reveal
 * that was written for latin and then had `dir="rtl"` bolted on: on `/ar` the
 * last word of the line would light up first. The DOM order is left untouched —
 * the browser already lays Arabic out right to left — and only the *reveal index*
 * is mirrored, so the animation moves in the direction the reader's eye does.
 */
function useRevealed(
  count: number,
  start: boolean,
  rtl: boolean,
): (i: number) => boolean {
  const [step, setStep] = useState(0);

  /*
   * Respected here as well as in the capability probe: this component renders
   * while the canvas is still fading in, and a visitor who asked for reduced
   * motion should not be handed a staggered reveal by a different component than
   * the one that checked.
   *
   * Read in the state initialiser, not in the effect. Writing it from inside the
   * effect body means one committed render of the wrong value followed by a
   * cascading second — for a preference that was knowable before the first
   * render. It is not re-read on change, because a preference flipping mid-page
   * cannot un-reveal words that are already on screen.
   */
  const [instant] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (!start || count === 0 || instant) return;
    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed += 1;
      setStep(revealed);
      if (revealed >= count) window.clearInterval(timer);
    }, STEP_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [count, start, instant]);

  return (index: number) => {
    if (instant) return true;
    // Mirrored index, not mirrored DOM: the browser already lays Arabic out
    // right to left, so only the reveal *order* has to turn around.
    const position = rtl ? count - 1 - index : index;
    return position < step;
  };
}

export function HeroWords({
  dir,
  locale,
  visible,
}: {
  dir: Direction;
  locale: Locale;
  visible: boolean;
}) {
  const t = getT(locale);
  const rtl = dir === 'rtl';
  const words = WORDS[locale];
  const isRevealed = useRevealed(words.length, visible, rtl);

  return (
    <div
      /*
        Over the canvas but never in front of the CTAs underneath it — the one
        interactive thing in here opts back into pointer events for itself.

        Logical properties, not a direction ternary. `items-start` and `ps-6`
        resolve to the reading-*start* edge in both directions, which is
        deliberately opposite the device: A3 anchors the phone to the end edge
        like the poster does, and the floating WhatsApp button is `fixed` to that
        same end corner in both directions (`right-5` on latin, `left-5` on
        Arabic). A ternary got this backwards on the first pass — `items-end` in
        an RTL container aligns *left*, which put the Arabic label directly under
        the WhatsApp button.
      */
      className="pointer-events-none absolute inset-0 flex flex-col items-start justify-end pb-8 ps-6"
    >
      <p
        // `uppercase` is gated off for Arabic. The script has no case, so the
        // class is inert at best; at worst a `text-transform` pass interferes
        // with shaping and the browser has to do the work to find out. Arabic
        // gets letter-spacing instead of nothing, so the label still reads as a
        // label.
        className={`font-display text-[0.68rem] font-semibold text-muted transition-opacity duration-500 sm:text-xs ${
          rtl ? 'tracking-[0.08em]' : 'uppercase tracking-[0.22em]'
        } ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            className={`inline-block transition-all duration-500 ${
              isRevealed(index)
                ? 'translate-y-0 opacity-100'
                : 'translate-y-1.5 opacity-0'
            }`}
            // A single space between words, in a wrapper that is inline-block so
            // the transform has something to apply to.
            style={{ marginInlineEnd: '0.34em' }}
          >
            {word}
          </span>
        ))}
      </p>

      {/*
        The scroll affordance. `pointer-events-auto` on the button alone, so the
        overlay stays transparent to clicks everywhere else.

        An anchor rather than a scripted scroll: it works before hydration, it
        works with JavaScript off, and it lands in the browser's own history. The
        focus ring is the site's `focus-visible` treatment made explicit here
        because this element sits on a canvas rather than on a page background,
        and the default ring colour is not guaranteed to be visible against it.
      */}
      <a
        href="#projects"
        className="focus-visible:ring-offset-bg pointer-events-auto mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-medium text-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:outline-none sm:text-xs"
      >
        {t('hero.scrollHint')}
        <span
          aria-hidden="true"
          // Points down, not along the reading direction: this is a scroll cue
          // and the page scrolls the same way in every language.
          className="inline-block"
        >
          ↓
        </span>
      </a>
    </div>
  );
}

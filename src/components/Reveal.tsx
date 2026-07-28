'use client';

import { useEffect, useRef, type ReactNode, type Ref, type TransitionEvent } from 'react';

/**
 * Scroll reveal via IntersectionObserver + CSS transition. Animates once.
 *
 * Zero animation-library cost: this is by far the most-used animation on the
 * page and it does not need a physics engine. Keeping it library-free is what
 * stops the motion core from being pulled into the first-paint chunk.
 *
 * It also holds no React state. The reveal is a single class flip on a node
 * that never re-renders, so driving it through `useState` would cost ~20
 * render passes for no benefit — and setting state synchronously in an effect
 * (needed for the reduced-motion path) is exactly what
 * `react-hooks/set-state-in-effect` flags. `className` is written by React only
 * when the prop value changes, and it never does here, so the imperative class
 * survives any parent re-render.
 *
 * `prefers-reduced-motion: reduce` is honoured twice over (B3): the CSS in
 * globals.css renders `.reveal` visible and transition-less under that query —
 * which also covers a visitor with JS disabled or still hydrating — and the
 * effect below reveals immediately instead of waiting to be scrolled to.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article' | 'span';
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reveal = () => { node.classList.add('reveal-in'); };

    // Reduced motion, or a browser with no IntersectionObserver: show the
    // content now. A reveal that never fires is a blank page, so every path
    // out of here has to end visible.
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      reveal();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal();
            observer.disconnect();
          }
        }
      },
      { rootMargin: '-60px' },
    );
    observer.observe(node);
    return () => { observer.disconnect(); };
  }, []);

  /**
   * The stagger delay has to sit on the *end* state for the transition to pick
   * it up, so it stays on the element after the reveal has played — where it
   * would also delay any hover transition the element owns (`.card-hover`'s
   * lift, for instance). Clear it once the reveal itself finishes; the target
   * check ignores transitions bubbling up from children.
   */
  const handleTransitionEnd = (event: TransitionEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && ref.current) {
      ref.current.style.transitionDelay = '0ms';
    }
  };

  /**
   * `reveal` and `reveal-in` must both appear in this file as plain, unbroken
   * literals. They are declared in globals.css's `@layer components`, and
   * Tailwind drops any rule in that layer whose class name its extractor
   * cannot find in a scanned file. Interpolating straight after the name —
   * `` `reveal${className}` `` — hides it, the rule is purged, and every
   * reveal silently renders with no animation at all.
   */
  const classes = className ? `reveal ${className}` : 'reveal';

  return (
    <Tag
      ref={ref as Ref<never>}
      className={classes}
      style={{ transitionDelay: `${delay * 80}ms` }}
      onTransitionEnd={handleTransitionEnd}
    >
      {children}
    </Tag>
  );
}

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { CloseIcon, MenuIcon, WhatsAppIcon } from '../Icons';

/**
 * The only two things in the header that need the browser: the scroll-position
 * class on <header>, and the mobile drawer's open state. They are split into
 * three tiny exports sharing one context so the header's actual content — the
 * logo, the desktop nav, the CTA — can stay server-rendered in Header.tsx and
 * never reach the client bundle.
 *
 * All props crossing the boundary are plain strings.
 */

interface DrawerContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

/** Shared between the toggle's aria-controls and the panel's id. */
const DRAWER_ID = 'mobile-drawer';
/** Lets the panel hand focus back to the toggle without threading a ref. */
const TOGGLE_ID = 'mobile-drawer-toggle';

function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('Drawer parts must be rendered inside HeaderShell');
  return ctx;
}

export interface DrawerLink {
  id: string;
  label: string;
}

/** The <header> element itself: owns scroll state and the drawer state. */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  /**
   * B1. Close the drawer when the viewport crosses into `lg`.
   *
   * The panel is `lg:hidden`, so above that width it vanishes without the state
   * changing — leaving `open` true, the body scroll-locked, and nothing on
   * screen to explain why the page will not move.
   */
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, []);

  /**
   * Lock body scroll while the drawer is open, and close on Escape (B7).
   *
   * Restores the PREVIOUS overflow rather than clearing it: the lightbox locks
   * scrolling too, and clearing unconditionally let a drawer closing on top of
   * an open lightbox hand scrolling back to a page the visitor cannot see.
   */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const value = useMemo<DrawerContextValue>(() => ({ open, setOpen }), [open]);

  return (
    <DrawerContext.Provider value={value}>
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
          scrolled
            ? 'border-b border-border/70 bg-bg/80 backdrop-blur-lg py-2'
            : 'bg-transparent py-4'
        }`}
      >
        {children}
      </header>
    </DrawerContext.Provider>
  );
}

/** Hamburger / close button. Rendered inside the server-built controls row. */
export function DrawerToggle() {
  const { open, setOpen } = useDrawer();

  return (
    <button
      type="button"
      id={TOGGLE_ID}
      onClick={() => {
        setOpen(!open);
      }}
      aria-label="Menu"
      aria-expanded={open}
      aria-controls={DRAWER_ID}
      className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface/60 text-fg lg:hidden"
    >
      {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
    </button>
  );
}

/** The expanding mobile panel, a sibling of <nav> inside <header>. */
export function DrawerPanel({
  links,
  ctaHref,
  ctaLabel,
}: {
  links: readonly DrawerLink[];
  ctaHref: string;
  ctaLabel: string;
}) {
  const { open, setOpen } = useDrawer();
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * B7. Move focus into the drawer when it opens, keep Tab inside it while it
   * is open, and hand focus back to the toggle when it closes — by any route,
   * including Escape and a link click. Without this a keyboard visitor tabs
   * straight past the open drawer into the page behind it.
   */
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusables = () =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);

    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', onKey);

    return () => {
      panel.removeEventListener('keydown', onKey);
      // Only reclaim focus if it is still inside the drawer being unmounted;
      // otherwise a visitor who clicked elsewhere gets yanked back.
      if (document.activeElement && panel.contains(document.activeElement)) {
        document.getElementById(TOGGLE_ID)?.focus();
      }
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          ref={panelRef}
          id={DRAWER_ID}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden lg:hidden"
        >
          <ul className="container-x flex flex-col gap-1 py-4">
            {links.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={() => {
                    setOpen(false);
                  }}
                  className="block rounded-xl px-4 py-3 text-base font-medium text-fg transition-colors hover:bg-surface-2"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setOpen(false);
                }}
                className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-base font-semibold text-white"
              >
                <WhatsAppIcon className="h-5 w-5" />
                {ctaLabel}
              </a>
            </li>
          </ul>
        </m.div>
      )}
    </AnimatePresence>
  );
}

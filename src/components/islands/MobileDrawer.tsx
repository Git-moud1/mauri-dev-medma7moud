'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
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
      onClick={() => {
        setOpen(!open);
      }}
      aria-label="Menu"
      aria-expanded={open}
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

  return (
    <AnimatePresence>
      {open && (
        <m.div
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

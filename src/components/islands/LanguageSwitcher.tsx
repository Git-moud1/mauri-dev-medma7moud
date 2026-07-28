'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useI18n } from '@/i18n/I18nProvider';
import { LOCALES, LOCALE_META, type Locale } from '@/i18n/config';
import { GlobeIcon } from '../Icons';

export function LanguageSwitcher() {
  const { locale, setLocale, t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  /**
   * B8. Three things were wrong here: the document listeners were attached for
   * the component's whole lifetime rather than only while the menu was open,
   * the menu could not be driven from the keyboard at all, and closing it left
   * focus on <body> — a keyboard visitor was dropped at the top of the document
   * with no indication of where they had been.
   */
  useEffect(() => {
    if (!open) return;

    function close(restoreFocus: boolean) {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    }

    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close(false);
    }

    function onKey(e: KeyboardEvent) {
      const items = [
        ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ??
          []),
      ];
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          close(true);
          break;
        case 'ArrowDown':
          e.preventDefault();
          items[current < 0 ? 0 : (current + 1) % items.length]?.focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          items[current <= 0 ? items.length - 1 : current - 1]?.focus();
          break;
        case 'Home':
          e.preventDefault();
          items[0]?.focus();
          break;
        case 'End':
          e.preventDefault();
          items[items.length - 1]?.focus();
          break;
        case 'Tab':
          // Tabbing out of an open menu closes it, but focus belongs wherever
          // the browser is taking it — not back on the trigger.
          close(false);
          break;
        default:
          break;
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(l: Locale) {
    setLocale(l);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-label={t('language.switch')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 text-sm font-semibold text-fg transition-colors hover:border-gold hover:text-gold"
      >
        <GlobeIcon className="h-4 w-4" />
        {LOCALE_META[locale].label}
      </button>

      <AnimatePresence>
        {open && (
          <m.ul
            ref={menuRef}
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className={`absolute top-12 z-50 min-w-[9rem] overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-card ${
              dir === 'rtl' ? 'left-0' : 'right-0'
            }`}
          >
            {LOCALES.map((l) => {
              const active = l === locale;
              return (
                <li key={l} role="none">
                  <button
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      choose(l);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-gold/15 font-semibold text-gold'
                        : 'text-fg hover:bg-surface-2'
                    }`}
                  >
                    <span>{LOCALE_META[l].native}</span>
                    <span className="text-xs text-muted">{LOCALE_META[l].label}</span>
                  </button>
                </li>
              );
            })}
          </m.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

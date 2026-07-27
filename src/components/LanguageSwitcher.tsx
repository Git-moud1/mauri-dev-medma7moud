'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useI18n } from '@/i18n/I18nProvider';
import { LOCALES, LOCALE_META, type Locale } from '@/i18n/config';
import { GlobeIcon } from './Icons';

export function LanguageSwitcher() {
  const { locale, setLocale, t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function choose(l: Locale) {
    setLocale(l);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
          <motion.ul
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
                    onClick={() => choose(l)}
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
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTheme } from '@/theme/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { MoonIcon, SunIcon } from './Icons';

export function ThemeToggle() {
  const { theme, toggle, ready } = useTheme();
  const { t } = useI18n();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}
      title={isDark ? t('theme.toLight') : t('theme.toDark')}
      className="relative grid h-10 w-10 place-items-center rounded-full border border-border bg-surface/60 text-fg transition-colors hover:border-gold hover:text-gold"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={ready ? theme : 'init'}
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.2 }}
          className="grid place-items-center"
        >
          {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

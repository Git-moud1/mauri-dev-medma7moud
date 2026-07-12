'use client';

import { motion } from 'framer-motion';
import { useI18n } from '@/i18n/I18nProvider';
import { SITE, whatsappLink } from '@/lib/site';
import { ArrowRightIcon, WhatsAppIcon, CodeIcon, SmartphoneIcon } from './Icons';

export function Hero() {
  const { t, dir } = useI18n();

  const stats = [
    { value: `${SITE.yearsExperience}+`, label: t('hero.stats.years') },
    { value: `${SITE.projectsDelivered}+`, label: t('hero.stats.projects') },
    { value: '10+', label: t('hero.stats.stacks') },
  ];

  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 grain opacity-60" />
        <div className="absolute -top-24 start-1/4 h-96 w-96 rounded-full bg-gold/20 blur-[120px]" />
        <div className="absolute bottom-0 end-1/4 h-80 w-80 rounded-full bg-gold-soft/10 blur-[120px]" />
      </div>

      <div className="container-x">
        <div className="mx-auto max-w-4xl text-center">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-fg"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            {t('hero.badge')}
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-6 font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl"
          >
            {t('hero.titleLine1')}{' '}
            <span className="gold-text">{t('hero.titleHighlight')}</span>
            <br />
            {t('hero.titleLine2')}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg"
          >
            {t('hero.subtitle')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <a href="#projects" className="btn-gold w-full sm:w-auto">
              {t('hero.ctaWork')}
              <ArrowRightIcon className={`h-4 w-4 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
            </a>
            <a
              href={whatsappLink("Hi Mauri-Dev, I'd like to discuss a project.")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline w-full sm:w-auto"
            >
              <WhatsAppIcon className="h-4 w-4" />
              {t('hero.ctaWhatsapp')}
            </a>
          </motion.div>

          {/* Web + App emphasis chips */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-8 flex items-center justify-center gap-3 text-sm text-muted"
          >
            <span className="inline-flex items-center gap-1.5">
              <CodeIcon className="h-4 w-4 text-gold" /> Web Apps
            </span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <span className="inline-flex items-center gap-1.5">
              <SmartphoneIcon className="h-4 w-4 text-gold" /> Mobile Apps
            </span>
          </motion.div>
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mx-auto mt-16 grid max-w-2xl grid-cols-3 divide-x divide-border rtl:divide-x-reverse"
        >
          {stats.map((s) => (
            <div key={s.label} className="px-2 text-center">
              <div className="font-display text-3xl font-bold gold-text sm:text-4xl">
                {s.value}
              </div>
              <div className="mt-1 text-xs text-muted sm:text-sm">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

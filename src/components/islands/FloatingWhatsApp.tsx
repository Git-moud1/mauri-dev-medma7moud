'use client';

import * as m from 'motion/react-m';
import { useI18n } from '@/i18n/I18nProvider';

import { WhatsAppIcon } from '../Icons';

const PREFILL = "Hi Mauri-Dev, I saw your portfolio and I'd like to discuss a project.";

/** Floating WhatsApp button, fixed to the bottom corner (respects RTL). */
export function FloatingWhatsApp({ whatsappUrl }: { whatsappUrl?: string }) {
  const { t, dir } = useI18n();
  // Every platform is optional now, WhatsApp included. With no number there is
  // nowhere for this to point, and a floating button linking to `undefined` is
  // worse than no button — so it does not render.
  if (!whatsappUrl) return null;

  return (
    <m.a
      href={`${whatsappUrl}?text=${encodeURIComponent(PREFILL)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('whatsappFloat')}
      data-anim-in
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.8, type: 'spring', stiffness: 260, damping: 20 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      // Same measured fix as the WhatsApp pill: the white mark on this green is
      // 1.98:1, which fails even the 3:1 bar for non-text graphics. Charcoal on
      // the same green is 9.86:1.
      className={`group fixed bottom-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-wa text-wa-fg shadow-[0_10px_30px_-6px_rgb(var(--wa)/0.6)] ${
        dir === 'rtl' ? 'left-5' : 'right-5'
      }`}
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-30 group-hover:opacity-40" />
      <WhatsAppIcon className="relative h-7 w-7" />
    </m.a>
  );
}

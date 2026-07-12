'use client';

import { motion } from 'framer-motion';
import { useI18n } from '@/i18n/I18nProvider';
import { whatsappLink } from '@/lib/site';
import { WhatsAppIcon } from './Icons';

const PREFILL = "Hi Mauri-Dev, I saw your portfolio and I'd like to discuss a project.";

/** Floating WhatsApp button, fixed to the bottom corner (respects RTL). */
export function FloatingWhatsApp() {
  const { t, dir } = useI18n();
  return (
    <motion.a
      href={whatsappLink(PREFILL)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('whatsappFloat')}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.8, type: 'spring', stiffness: 260, damping: 20 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      className={`group fixed bottom-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_-6px_rgba(37,211,102,0.6)] ${
        dir === 'rtl' ? 'left-5' : 'right-5'
      }`}
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-30 group-hover:opacity-40" />
      <WhatsAppIcon className="relative h-7 w-7" />
    </motion.a>
  );
}

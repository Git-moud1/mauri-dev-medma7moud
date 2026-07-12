'use client';

import { useEffect } from 'react';
import { useI18n } from '@/i18n/I18nProvider';

/**
 * Keeps <title> and <meta name="description"> in sync with the active language
 * (client-side i18n). Root layout provides the default (Arabic) SEO metadata for
 * crawlers; this refines it once a visitor picks a language.
 */
export function DocumentMeta() {
  const { dict, ready } = useI18n();

  useEffect(() => {
    if (!ready) return;
    document.title = dict.meta.title;
    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement('meta');
      desc.setAttribute('name', 'description');
      document.head.appendChild(desc);
    }
    desc.setAttribute('content', dict.meta.description);
  }, [dict, ready]);

  return null;
}

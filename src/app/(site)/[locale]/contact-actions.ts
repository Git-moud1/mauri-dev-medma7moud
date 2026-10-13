'use server';

import { clientIp } from '@/lib/auth/request';
import { consumeQuota } from '@/lib/auth/rate-limit';
import { contactSchema, deliverContactMessage } from '@/lib/contact';
import { isLocale } from '@/i18n/locale';

export type ContactResult = { ok: true } | { ok: false; reason: 'invalid' | 'failed' };

/**
 * The public contact form's submit.
 *
 * Spam handling, cheapest first:
 * - `botField` is the honeypot. A filled one is answered `ok` and dropped, so
 *   the bot learns nothing.
 * - Five messages per IP per hour and forty per day site-wide. Over either,
 *   it reports a failure, so a real visitor sees the error text pointing them
 *   to WhatsApp. The daily cap also keeps Resend's 100/day free quota for
 *   password resets.
 */
export async function sendContactMessage(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
  botField: string;
  locale: string;
}): Promise<ContactResult> {
  if (input.botField) return { ok: true };

  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'invalid' };

  const ip = await clientIp();
  const allowed =
    (await consumeQuota(`contact-ip:${ip}`, 5, 60 * 60)) &&
    (await consumeQuota('contact-site', 40, 24 * 60 * 60));
  if (!allowed) return { ok: false, reason: 'failed' };

  const locale = isLocale(input.locale) ? input.locale : 'ar';
  const delivered = await deliverContactMessage(parsed.data, locale);
  return delivered ? { ok: true } : { ok: false, reason: 'failed' };
}

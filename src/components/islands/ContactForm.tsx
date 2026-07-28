'use client';

import { useState, type FormEvent } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useI18n } from '@/i18n/I18nProvider';
import { CheckIcon, SendIcon } from '../Icons';

type Status = 'idle' | 'sending' | 'success' | 'error';
type Errors = Partial<Record<'name' | 'email' | 'message', string>>;

function encode(data: Record<string, string>): string {
  return Object.keys(data)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`)
    .join('&');
}

export function ContactForm() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Errors>({});

  function validate(form: HTMLFormElement): Errors {
    const next: Errors = {};
    const name = (form.elements.namedItem('name') as HTMLInputElement)?.value.trim();
    const email = (form.elements.namedItem('email') as HTMLInputElement)?.value.trim();
    const message = (form.elements.namedItem('message') as HTMLTextAreaElement)?.value.trim();
    if (!name) next.name = t('contact.form.required');
    if (!email) next.email = t('contact.form.required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = t('contact.form.invalidEmail');
    if (!message) next.message = t('contact.form.required');
    return next;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const firstKey = Object.keys(found)[0];
      (form.elements.namedItem(firstKey) as HTMLElement | null)?.focus();
      return;
    }

    setStatus('sending');
    const data = new FormData(form);
    const payload: Record<string, string> = { 'form-name': 'contact' };
    data.forEach((v, k) => (payload[k] = String(v)));

    try {
      const res = await fetch('/__forms.html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encode(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('success');
      form.reset();
    } catch {
      setStatus('error');
    }
  }

  const fieldBase =
    'w-full rounded-2xl border bg-surface px-4 py-3 text-sm text-fg placeholder:text-muted/70 transition-colors focus:outline-none focus:border-gold';

  return (
    <form
      name="contact"
      method="POST"
      data-netlify="true"
      data-netlify-honeypot="bot-field"
      onSubmit={handleSubmit}
      noValidate
      className="glass rounded-3xl p-6 sm:p-8"
    >
      {/* Netlify hidden fields */}
      <input type="hidden" name="form-name" value="contact" />
      <p className="hidden">
        <label>
          Don’t fill this out: <input name="bot-field" />
        </label>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            {t('contact.form.name')} <span className="text-gold">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            className={`${fieldBase} ${errors.name ? 'border-red-500' : 'border-border'}`}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'name-error' : undefined}
          />
          {errors.name && (
            <p id="name-error" role="alert" className="mt-1 text-xs text-red-500">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            {t('contact.form.email')} <span className="text-gold">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className={`${fieldBase} ${errors.email ? 'border-red-500' : 'border-border'}`}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" role="alert" className="mt-1 text-xs text-red-500">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="subject" className="mb-1.5 block text-sm font-medium">
          {t('contact.form.subject')}
        </label>
        <input id="subject" name="subject" type="text" className={`${fieldBase} border-border`} />
      </div>

      <div className="mt-4">
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
          {t('contact.form.message')} <span className="text-gold">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          className={`${fieldBase} resize-y ${errors.message ? 'border-red-500' : 'border-border'}`}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? 'message-error' : undefined}
        />
        {errors.message && (
          <p id="message-error" role="alert" className="mt-1 text-xs text-red-500">
            {errors.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="btn-gold mt-6 w-full"
      >
        {status === 'sending' ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {t('contact.form.sending')}
          </>
        ) : (
          <>
            <SendIcon className="h-4 w-4" />
            {t('contact.form.send')}
          </>
        )}
      </button>

      {/* Feedback */}
      <div aria-live="polite" className="mt-4">
        <AnimatePresence mode="wait">
          {status === 'success' && (
            <m.p
              key="success"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-2xl bg-green-500/12 px-4 py-3 text-sm text-green-600 dark:text-green-400"
            >
              <CheckIcon className="h-4 w-4" />
              {t('contact.form.success')}
            </m.p>
          )}
          {status === 'error' && (
            <m.p
              key="error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl bg-red-500/12 px-4 py-3 text-sm text-red-600 dark:text-red-400"
            >
              {t('contact.form.error')}
            </m.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}

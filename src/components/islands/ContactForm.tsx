'use client';

import { useState, type SyntheticEvent } from 'react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useI18n } from '@/i18n/I18nProvider';
import { CheckIcon, SendIcon } from '../Icons';

type Status = 'idle' | 'sending' | 'success' | 'error';
type Errors = Partial<Record<'name' | 'email' | 'message', string>>;

function encode(data: Record<string, string>): string {
  // Entries rather than keys-then-index: indexing a Record by a string yields
  // `string | undefined` under noUncheckedIndexedAccess, and encoding an
  // undefined would post the literal "undefined" as the field value.
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export function ContactForm() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Errors>({});

  function validate(form: HTMLFormElement): Errors {
    const next: Errors = {};
    // Cast includes null: namedItem returns null for a missing field, and
    // asserting it away made the optional chains below look redundant to the
    // linter while they were in fact the only thing preventing a throw.
    const name = (
      form.elements.namedItem('name') as HTMLInputElement | null
    )?.value.trim();
    const email = (
      form.elements.namedItem('email') as HTMLInputElement | null
    )?.value.trim();
    const message = (
      form.elements.namedItem('message') as HTMLTextAreaElement | null
    )?.value.trim();
    if (!name) next.name = t('contact.form.required');
    if (!email) next.email = t('contact.form.required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = t('contact.form.invalidEmail');
    if (!message) next.message = t('contact.form.required');
    return next;
  }

  // React 19's types deprecate FormEvent ("doesn't actually exist"); a submit
  // handler receives a SyntheticEvent wrapping the native SubmitEvent.
  async function handleSubmit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const form = e.currentTarget;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const firstKey = Object.keys(found)[0];
      if (firstKey) (form.elements.namedItem(firstKey) as HTMLElement | null)?.focus();
      return;
    }

    setStatus('sending');
    const data = new FormData(form);
    const payload: Record<string, string> = { 'form-name': 'contact' };
    // FormData values are string | File. There is no file input on this form,
    // but stringifying a File would post "[object File]" rather than fail, so
    // the non-string case is dropped explicitly.
    data.forEach((v, k) => {
      if (typeof v === 'string') payload[k] = v;
    });

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

  /**
   * B9. Errors were set on submit and never cleared, so a corrected field kept
   * its red border and its message until the next submit — the form looked
   * broken while the visitor was actively fixing it.
   */
  function clearError(field: keyof Errors) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      // Rebuilt by omission rather than `delete`: same result, and it keeps the
      // object shape static instead of mutating a copy.
      const { [field]: _cleared, ...rest } = prev;
      return rest;
    });
  }

  const fieldBase =
    'w-full rounded-2xl border bg-surface px-4 py-3 text-sm text-fg placeholder:text-muted/70 transition-colors focus:outline-none focus:border-gold';

  return (
    <form
      name="contact"
      method="POST"
      data-netlify="true"
      data-netlify-honeypot="bot-field"
      // `void` rather than passing the async function straight in: React
      // ignores the returned promise, so an unhandled rejection would surface
      // as an unhandled rejection instead of the form's error state.
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
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
            onChange={() => {
              clearError('name');
            }}
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
            onChange={() => {
              clearError('email');
            }}
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
        <input
          id="subject"
          name="subject"
          type="text"
          className={`${fieldBase} border-border`}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
          {t('contact.form.message')} <span className="text-gold">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          onChange={() => {
            clearError('message');
          }}
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

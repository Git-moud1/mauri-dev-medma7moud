'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordReset, type AccountResult } from '../account/actions';

/**
 * Same card as the sign-in page. Asks for the admin address and always answers
 * the same way, so it cannot be used to discover which address is the admin's.
 */
export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<AccountResult | null, FormData>(
    requestPasswordReset,
    null,
  );

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-3xl border border-border bg-surface p-8"
      >
        <h1 className="font-display text-2xl font-bold">Reset password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter the admin email. A reset link valid for 5 minutes (two openings) will be
          sent to it.
        </p>

        <label htmlFor="email" className="mt-6 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          className="mt-1.5 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-fg transition-colors focus:border-gold focus:outline-none"
        />

        {state ? (
          <p
            role={state.ok ? 'status' : 'alert'}
            className={`mt-3 text-sm ${state.ok ? 'text-muted' : 'text-red-500'}`}
          >
            {state.ok ? state.message : state.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn-gold mt-6 w-full">
          {pending ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="mt-4 text-center text-sm">
          <Link href="/admin" className="text-muted transition-colors hover:text-fg">
            Back to sign in
          </Link>
        </p>
      </form>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useActionState, useEffect, useSyncExternalStore } from 'react';
import { resetPassword, type AccountResult } from '../account/actions';

const FIELD =
  'mt-1.5 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-fg transition-colors focus:border-gold focus:outline-none';

/**
 * Set a new password from an emailed link.
 *
 * The token arrives in the URL fragment (`#token=…`), which the browser never
 * sends to a server, so it is absent from every request log and Referer
 * header. It is read here, kept in state, and wiped from the address bar
 * straight away so it does not linger in history or a screenshot.
 *
 * Loading this page does not use the link — only submitting the form does.
 * Mail scanners that open links therefore cannot burn it.
 */
/**
 * Read once per page load and kept here, because the address bar is wiped
 * right after: a later read of `location.hash` would find nothing.
 */
let captured: string | null = null;

function tokenFromFragment(): string {
  if (captured === null) {
    const match = /(?:^|&)token=([A-Za-z0-9_-]+)/.exec(window.location.hash.slice(1));
    captured = match?.[1] ?? '';
  }
  return captured;
}

const noSubscription = () => () => {};

export default function ResetPasswordPage() {
  // Server snapshot is '' — the fragment does not exist on the server — and
  // React swaps in the browser's value after hydration without a mismatch.
  const token = useSyncExternalStore(noSubscription, tokenFromFragment, () => '');
  const [state, formAction, pending] = useActionState<AccountResult | null, FormData>(
    resetPassword,
    null,
  );

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  if (state?.ok) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-8">
          <h1 className="font-display text-2xl font-bold">Password changed</h1>
          <p role="status" className="mt-2 text-sm text-muted">
            {state.message}
          </p>
          <Link href="/admin" className="btn-gold mt-6 block w-full text-center">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-3xl border border-border bg-surface p-8"
      >
        <h1 className="font-display text-2xl font-bold">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted">
          At least 12 characters mixing three of lowercase, uppercase, digits and symbols
          — or a passphrase of 16+.
        </p>

        <input type="hidden" name="token" value={token} />

        <label htmlFor="newPassword" className="mt-6 block text-sm font-medium">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={200}
          required
          className={FIELD}
        />

        <label htmlFor="confirmPassword" className="mt-4 block text-sm font-medium">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={200}
          required
          className={FIELD}
        />

        {state ? (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {state.error}
          </p>
        ) : null}
        {!token ? (
          <p role="alert" className="mt-3 text-sm text-red-500">
            This page needs the link from the reset email.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !token}
          className="btn-gold mt-6 w-full"
        >
          {pending ? 'Saving…' : 'Set new password'}
        </button>

        <p className="mt-4 text-center text-sm">
          <Link
            href="/admin/forgot"
            className="text-muted transition-colors hover:text-fg"
          >
            Request a new link
          </Link>
        </p>
      </form>
    </main>
  );
}

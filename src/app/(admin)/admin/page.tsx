'use client';

import { useActionState } from 'react';
import { login, type ActionState } from './actions';

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    login,
    null,
  );

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-3xl border border-border bg-surface p-8"
      >
        <h1 className="font-display text-2xl font-bold">Admin</h1>
        <p className="mt-1 text-sm text-muted">Mauri-Dev content management</p>

        <label htmlFor="password" className="mt-6 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-fg transition-colors focus:border-gold focus:outline-none"
        />

        {state?.error ? (
          <p role="alert" className="mt-3 text-sm text-red-500">
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn-gold mt-6 w-full">
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

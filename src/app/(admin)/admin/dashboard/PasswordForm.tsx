'use client';

import { useActionState, useEffect, useRef } from 'react';
import { changePassword, type AccountResult } from '../account/actions';
import { useToast } from '../ui/Toaster';
import { Button, Field, Section, TextInput } from '../ui/primitives';

/**
 * Change the admin password. Its own form, below the site settings, so a
 * password field is never submitted with — or blocked by — the settings.
 */
export function PasswordForm() {
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<AccountResult | null, FormData>(
    changePassword,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.push({ tone: 'success', text: state.message });
      formRef.current?.reset();
    }
  }, [state, toast]);

  return (
    <form ref={formRef} action={formAction} className="mt-12 space-y-5">
      <Section
        title="Password"
        description="At least 12 characters mixing three of lowercase, uppercase, digits and symbols — or a passphrase of 16+. Changing it signs out every other session."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Current password">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            )}
          </Field>
          <Field label="New password">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={200}
                required
              />
            )}
          </Field>
          <Field label="Confirm new password">
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={200}
                required
              />
            )}
          </Field>
        </div>
      </Section>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-400"
        >
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" loading={pending}>
        Change password
      </Button>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteSettings } from '@/lib/content/types';
import {
  CONTACT_PLATFORMS,
  FOLLOW_PLATFORMS,
  socialFieldName,
  type SocialKey,
  type SocialPlatform,
} from '@/lib/social';
import { SOCIAL_ICONS } from '@/components/SocialIcons';
import { updateSettings } from '../actions';
import { Button, Field, Section, TextInput } from '../ui/primitives';
import { useToast } from '../ui/Toaster';

/** English admin copy. The public site translates these; the admin does not. */
const PLATFORM_NAMES: Record<SocialKey, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  x: 'X',
};

/**
 * One labelled row: the platform's mark, its name, the input, and the link the
 * input currently resolves to.
 *
 * The preview runs the same `toStored`/`toHref` the schema will run on save,
 * so what it shows is what gets stored — it is not a second implementation of
 * "make this a URL" that could drift. While the value is unparseable it says
 * so in place of a link, which means the owner sees the problem before
 * pressing Save rather than after.
 */
function PlatformField({
  platform,
  value,
  error,
  onChange,
}: {
  platform: SocialPlatform;
  value: string;
  error: string | undefined;
  onChange: (next: string) => void;
}) {
  const Icon = SOCIAL_ICONS[platform.key];
  const trimmed = value.trim();
  const stored = trimmed ? platform.toStored(trimmed) : null;

  return (
    <Field
      label={
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted" />
          {PLATFORM_NAMES[platform.key]}
        </span>
      }
      error={error}
    >
      {({ id, describedBy }) => (
        <>
          <TextInput
            id={id}
            name={socialFieldName(platform.key)}
            aria-describedby={describedBy}
            inputMode={platform.key === 'whatsapp' ? 'numeric' : undefined}
            placeholder={platform.placeholder}
            invalid={Boolean(error)}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
          {/*
            Empty is a state, not a failure — the row stays, and the line below
            says the field simply is not published rather than showing an error
            or an empty link.
          */}
          <p className="mt-1.5 break-all text-xs text-muted">
            {!trimmed ? (
              'Not published.'
            ) : stored ? (
              <>
                Link: <span className="font-mono text-fg">{platform.toHref(stored)}</span>
              </>
            ) : (
              <span className="text-red-400">Not a link yet.</span>
            )}
          </p>
        </>
      )}
    </Field>
  );
}

export function SettingsForm({ settings }: { settings: SiteSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<SocialKey, string>>({
    whatsapp: settings.whatsappNumber ?? '',
    email: settings.email ?? '',
    linkedin: settings.socials.linkedin ?? '',
    github: settings.socials.github ?? '',
    instagram: settings.socials.instagram ?? '',
    facebook: settings.socials.facebook ?? '',
    tiktok: settings.socials.tiktok ?? '',
    x: settings.socials.x ?? '',
  });

  async function save(formData: FormData) {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    const result = await updateSettings(formData);
    setSaving(false);
    if (result.ok) {
      toast.push({ tone: 'success', text: 'Settings saved.' });
      router.refresh();
    } else {
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
    }
  }

  function fieldProps(platform: SocialPlatform) {
    const name = socialFieldName(platform.key);
    return {
      platform,
      value: values[platform.key],
      error: fieldErrors[name],
      onChange: (next: string) => {
        setValues((current) => ({ ...current, [platform.key]: next }));
        // Clear this field's error as soon as it is edited. Leaving a stale
        // message under a field the owner has already corrected reads as if
        // the correction did not take.
        setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
      },
    };
  }

  return (
    <form action={(formData) => void save(formData)} className="space-y-8">
      <Section
        title="Contact"
        description="Wide buttons in the footer and the contact section. Both optional — leave one blank and it is not published."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {CONTACT_PLATFORMS.map((platform) => (
            <PlatformField key={platform.key} {...fieldProps(platform)} />
          ))}
        </div>
      </Section>

      <Section
        title="Follow"
        description="Icon tiles under their own heading, in this order. Every one is optional; blank fields render nothing at all."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {FOLLOW_PLATFORMS.map((platform) => (
            <PlatformField key={platform.key} {...fieldProps(platform)} />
          ))}
        </div>
      </Section>

      <Section
        title="Hero"
        description="The three figures under the headline, and the badge."
      >
        <div className="grid max-w-xl gap-4 sm:grid-cols-3">
          <Field label="Years of experience">
            {({ id }) => (
              <TextInput
                id={id}
                name="heroStats.years"
                type="number"
                min={0}
                defaultValue={settings.heroStats.years}
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label="Projects delivered">
            {({ id }) => (
              <TextInput
                id={id}
                name="heroStats.projects"
                type="number"
                min={0}
                defaultValue={settings.heroStats.projects}
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label="Stacks">
            {({ id }) => (
              <TextInput
                id={id}
                name="heroStats.stacks"
                type="number"
                min={0}
                defaultValue={settings.heroStats.stacks}
                className="tabular-nums"
              />
            )}
          </Field>
        </div>

        <label className="mt-5 flex w-fit cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="availableForWork"
            defaultChecked={settings.availableForWork}
            className="h-4 w-4 rounded border-border bg-bg accent-gold"
          />
          Show the “available for work” badge
        </label>
      </Section>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </p>
      ) : null}

      <div className="border-t border-border/60 pt-6">
        <Button type="submit" variant="primary" loading={saving}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

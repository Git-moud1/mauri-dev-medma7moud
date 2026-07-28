'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteSettings } from '@/lib/content/types';
import { updateSettings } from '../actions';
import { Button, Field, IconButton, Section, TextInput } from '../ui/primitives';
import { useToast } from '../ui/Toaster';

interface SocialDraft {
  key: number;
  platform: string;
  url: string;
  label: string;
}

export function SettingsForm({ settings }: { settings: SiteSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState(settings.whatsappNumber);
  const [socials, setSocials] = useState<SocialDraft[]>(
    settings.socials.map((social, index) => ({ key: index, ...social })),
  );
  const [nextKey, setNextKey] = useState(settings.socials.length);

  async function save(formData: FormData) {
    setSaving(true);
    setError(null);
    const result = await updateSettings(formData);
    setSaving(false);
    if (result.ok) {
      toast.push({ tone: 'success', text: 'Settings saved.' });
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  function moveSocial(from: number, to: number) {
    if (to < 0 || to >= socials.length) return;
    const next = [...socials];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    setSocials(next);
  }

  return (
    <form action={(formData) => void save(formData)} className="space-y-8">
      <Section title="Contact" description="Where the site's WhatsApp buttons point.">
        <div className="max-w-sm">
          <Field
            label="WhatsApp number"
            required
            hint="Digits only, including the country code."
          >
            {({ id, describedBy }) => (
              <TextInput
                id={id}
                name="whatsappNumber"
                aria-describedby={describedBy}
                inputMode="numeric"
                value={whatsapp}
                onChange={(event) => {
                  setWhatsapp(event.target.value);
                }}
              />
            )}
          </Field>
          {/*
            Derived, not stored — one field to edit, so the number and the URL
            cannot drift apart. Shown read-only so it is obvious where it comes
            from rather than looking like a second thing to maintain.
          */}
          <p className="mt-2 text-xs text-muted">
            Link:{' '}
            <span className="font-mono text-fg">https://wa.me/{whatsapp || '…'}</span>
          </p>
        </div>
      </Section>

      <Section
        title="Social"
        description="Rendered in the footer and the contact section, in this order."
      >
        {socials.length === 0 ? (
          <p className="text-sm text-muted">No links yet.</p>
        ) : (
          <ul className="space-y-3">
            {socials.map((social, index) => (
              <li key={social.key} className="flex items-end gap-2">
                <div className="grid flex-1 gap-3 sm:grid-cols-3">
                  <Field label="Platform">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        name="social.platform"
                        placeholder="GitHub"
                        value={social.platform}
                        onChange={(event) => {
                          setSocials(
                            socials.map((entry) =>
                              entry.key === social.key
                                ? { ...entry, platform: event.target.value }
                                : entry,
                            ),
                          );
                        }}
                      />
                    )}
                  </Field>
                  <Field label="URL">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        name="social.url"
                        type="url"
                        placeholder="https://github.com/…"
                        value={social.url}
                        onChange={(event) => {
                          setSocials(
                            socials.map((entry) =>
                              entry.key === social.key
                                ? { ...entry, url: event.target.value }
                                : entry,
                            ),
                          );
                        }}
                      />
                    )}
                  </Field>
                  <Field label="Label">
                    {({ id }) => (
                      <TextInput
                        id={id}
                        name="social.label"
                        placeholder="Shown to visitors"
                        value={social.label}
                        onChange={(event) => {
                          setSocials(
                            socials.map((entry) =>
                              entry.key === social.key
                                ? { ...entry, label: event.target.value }
                                : entry,
                            ),
                          );
                        }}
                      />
                    )}
                  </Field>
                </div>
                <div className="flex pb-1">
                  <IconButton
                    label={`Move ${social.platform || 'link'} up`}
                    disabled={index === 0}
                    onClick={() => {
                      moveSocial(index, index - 1);
                    }}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label={`Move ${social.platform || 'link'} down`}
                    disabled={index === socials.length - 1}
                    onClick={() => {
                      moveSocial(index, index + 1);
                    }}
                  >
                    ↓
                  </IconButton>
                  <IconButton
                    label={`Remove ${social.platform || 'link'}`}
                    tone="danger"
                    onClick={() => {
                      setSocials(socials.filter((entry) => entry.key !== social.key));
                    }}
                  >
                    ×
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Button
          className="mt-4"
          onClick={() => {
            setSocials([...socials, { key: nextKey, platform: '', url: '', label: '' }]);
            setNextKey(nextKey + 1);
          }}
        >
          Add social link
        </Button>
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

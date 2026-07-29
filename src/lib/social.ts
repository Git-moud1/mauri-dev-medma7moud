/**
 * The closed set of social platforms, in render order.
 *
 * One ordered array is the single source of truth: the admin form, the
 * settings schema and the public components all read from it, so adding a
 * platform later is one entry rather than a change in four files.
 *
 * This module must stay client-safe — no server imports. The admin form calls
 * `toStored`/`toHref` on every keystroke to render the live link preview, and
 * the zod schema calls the same functions on save. Preview and stored value
 * therefore cannot disagree, which is the whole point of putting them here
 * instead of duplicating a "looks like a URL" check in each place.
 */

export const CONTACT_KEYS = ['whatsapp', 'email'] as const;
export const FOLLOW_KEYS = [
  'linkedin',
  'github',
  'instagram',
  'facebook',
  'tiktok',
  'x',
] as const;

export type ContactKey = (typeof CONTACT_KEYS)[number];
export type FollowKey = (typeof FOLLOW_KEYS)[number];
export type SocialKey = ContactKey | FollowKey;

export interface SocialPlatform {
  key: SocialKey;
  /** Contact platforms render as wide pills, follow platforms as icon tiles. */
  group: 'contact' | 'follow';
  /** Shows the expected shape in the empty input. */
  placeholder: string;
  /** Shown against this field alone when `toStored` returns null. */
  invalid: string;
  /**
   * Raw admin input to the value that gets persisted, or `null` when the input
   * cannot be understood. `null` is the only validation signal — there is no
   * second validator that could fall out of step with this one.
   *
   * Blank input never reaches here: empty means "not published", not an error.
   */
  toStored(raw: string): string | null;
  /** Persisted value to the href. Identity for everything but the two contacts. */
  toHref(stored: string): string;
  /** What a contact pill prints beside its label. Follow tiles show no text. */
  toDisplay(stored: string): string;
}

/**
 * Is this a URL the owner pasted, or a bare handle they typed?
 *
 * Deliberately not "does it contain a dot": Instagram and TikTok handles are
 * allowed to contain dots (`bay.cheikh`), and treating those as hostnames sent
 * every dotted handle down the URL branch to be rejected. A scheme, a slash or
 * one of the platform's own hostnames is what actually distinguishes them.
 */
function looksLikeUrl(raw: string, hosts: readonly string[]): boolean {
  const value = raw.trim().toLowerCase();
  return (
    /^[a-z][a-z0-9+.-]*:\/\//.test(value) ||
    value.includes('/') ||
    hosts.some((host) => value === host || value.startsWith(`${host}:`))
  );
}

function parseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    // http:// is upgraded rather than rejected — the owner pasted a real
    // profile and meant the secure one. Anything else (javascript:, data:) is
    // not a profile link and is refused.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.protocol = 'https:';
    return url;
  } catch {
    return null;
  }
}

function hostMatches(url: URL, hosts: readonly string[]): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return hosts.includes(host);
}

/** Trims the decoration a handle is usually copied with: `@`, slashes, spaces. */
function cleanHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .replace(/^\/+|\/+$/g, '');
}

const HANDLE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * The common shape: a bare handle becomes `https://<host>/<prefix><handle>`,
 * and a full URL is accepted only if it is actually on that platform.
 *
 * A GitHub URL pasted into the Instagram field is a mistake worth reporting,
 * not something to rewrite into a link that goes somewhere the owner did not
 * intend — so a foreign host is `null`.
 */
function handleOrUrl(options: {
  hosts: readonly string[];
  canonicalHost: string;
  /** Prepended to a bare handle. `@` for TikTok, `in/` for LinkedIn. */
  prefix?: string;
  /** Keep `?query` — Facebook share links carry their identity in it. */
  keepSearch?: boolean;
}): (raw: string) => string | null {
  const { hosts, canonicalHost, prefix = '', keepSearch = false } = options;

  return (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (!looksLikeUrl(trimmed, hosts)) {
      const handle = cleanHandle(trimmed);
      if (!HANDLE.test(handle)) return null;
      return `https://${canonicalHost}/${prefix}${handle}`;
    }

    const url = parseUrl(trimmed);
    if (!url || !hostMatches(url, hosts)) return null;

    // Drop the trailing slash so two spellings of one profile store identically,
    // and drop the tracking query unless this platform needs it.
    const path = url.pathname.replace(/\/+$/, '');
    if (!path) return null;
    return `https://${canonicalHost}${path}${keepSearch ? url.search : ''}`;
  };
}

const identity = (stored: string) => stored;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  {
    key: 'whatsapp',
    group: 'contact',
    placeholder: '22231317501',
    invalid: 'Digits only, including the country code — 8 to 15 of them.',
    /**
     * Stored as digits, not as a wa.me URL. The number is the thing the owner
     * edits and the URL is derived from it, so the two cannot drift apart —
     * the same reasoning `settingsSchema` already applies to `whatsappUrl`.
     */
    toStored: (raw) => {
      const digits = raw.replace(/[\s+()-]/g, '');
      return /^\d{8,15}$/.test(digits) ? digits : null;
    },
    toHref: (stored) => `https://wa.me/${stored}`,
    toDisplay: (stored) => `+${stored}`,
  },
  {
    key: 'email',
    group: 'contact',
    placeholder: 'you@example.com',
    invalid: 'That is not a valid email address.',
    toStored: (raw) => {
      const address = raw.trim();
      return EMAIL.test(address) ? address : null;
    },
    toHref: (stored) => `mailto:${stored}`,
    toDisplay: identity,
  },
  {
    key: 'linkedin',
    group: 'follow',
    placeholder: 'https://linkedin.com/in/username',
    invalid: 'Use a linkedin.com profile URL, or just the profile handle.',
    toStored: handleOrUrl({
      hosts: ['linkedin.com', 'lnkd.in'],
      canonicalHost: 'linkedin.com',
      // A bare handle is overwhelmingly a personal profile. A company or school
      // page still works — it just has to be pasted as a full URL, whose path
      // is preserved as typed.
      prefix: 'in/',
    }),
    toHref: identity,
    toDisplay: identity,
  },
  {
    key: 'github',
    group: 'follow',
    placeholder: 'username or https://github.com/username',
    invalid: 'Use a github.com URL, or just the username.',
    toStored: handleOrUrl({ hosts: ['github.com'], canonicalHost: 'github.com' }),
    toHref: identity,
    toDisplay: identity,
  },
  {
    key: 'instagram',
    group: 'follow',
    placeholder: 'username or https://instagram.com/username',
    invalid: 'Use an instagram.com URL, or just the username.',
    toStored: handleOrUrl({
      hosts: ['instagram.com', 'instagr.am'],
      canonicalHost: 'instagram.com',
    }),
    toHref: identity,
    toDisplay: identity,
  },
  {
    key: 'facebook',
    group: 'follow',
    placeholder: 'https://facebook.com/username',
    invalid: 'Use a facebook.com URL — share and profile.php links are fine.',
    toStored: handleOrUrl({
      hosts: ['facebook.com', 'fb.com', 'fb.me', 'm.facebook.com'],
      canonicalHost: 'facebook.com',
      // `profile.php?id=…` and `/share/…?mibextid=…` are how Facebook spells
      // plenty of real profiles. Stripping the query would break them.
      keepSearch: true,
    }),
    toHref: identity,
    toDisplay: identity,
  },
  {
    key: 'tiktok',
    group: 'follow',
    placeholder: '@handle or https://tiktok.com/@handle',
    invalid: 'Use a tiktok.com URL, or just the @handle.',
    toStored: handleOrUrl({
      hosts: ['tiktok.com', 'vm.tiktok.com'],
      canonicalHost: 'tiktok.com',
      prefix: '@',
    }),
    toHref: identity,
    toDisplay: identity,
  },
  {
    key: 'x',
    group: 'follow',
    placeholder: '@handle or https://x.com/handle',
    invalid: 'Use an x.com or twitter.com URL, or just the @handle.',
    // twitter.com links still exist everywhere and resolve to the same account,
    // so they are accepted and rewritten rather than rejected as the wrong site.
    toStored: handleOrUrl({
      hosts: ['x.com', 'twitter.com', 'mobile.twitter.com'],
      canonicalHost: 'x.com',
    }),
    toHref: identity,
    toDisplay: identity,
  },
] as const;

/**
 * The `name` this platform's input posts under.
 *
 * `whatsappNumber` keeps the name it has always had — five public components
 * read the setting it feeds, and renaming the field to match the others would
 * have been churn for symmetry alone.
 */
export function socialFieldName(key: SocialKey): string {
  if (key === 'whatsapp') return 'whatsappNumber';
  if (key === 'email') return 'email';
  return `social.${key}`;
}

const BY_KEY = new Map(SOCIAL_PLATFORMS.map((platform) => [platform.key, platform]));

export function socialPlatform(key: SocialKey): SocialPlatform {
  const platform = BY_KEY.get(key);
  // Unreachable through the type system; a throw beats returning undefined into
  // a render path where it would surface as a blank tile with no explanation.
  if (!platform) throw new Error(`Unknown social platform: ${key}`);
  return platform;
}

export const CONTACT_PLATFORMS = SOCIAL_PLATFORMS.filter(
  (platform) => platform.group === 'contact',
);
export const FOLLOW_PLATFORMS = SOCIAL_PLATFORMS.filter(
  (platform) => platform.group === 'follow',
);

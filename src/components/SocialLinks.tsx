import { getT } from '@/i18n/server';
import type { Locale } from '@/i18n/config';
import type { SiteSettings } from '@/lib/content/types';
import {
  CONTACT_PLATFORMS,
  FOLLOW_PLATFORMS,
  type SocialKey,
  type SocialPlatform,
} from '@/lib/social';
import { SOCIAL_ICONS } from './SocialIcons';

export interface ResolvedLink {
  key: SocialKey;
  href: string;
  /** Printed beside the label on a contact pill. Follow tiles ignore it. */
  display: string;
}

function stored(settings: SiteSettings, platform: SocialPlatform): string | undefined {
  if (platform.key === 'whatsapp') return settings.whatsappNumber;
  if (platform.key === 'email') return settings.email;
  // Both contact keys are excluded above, so this narrows to a follow key.
  return settings.socials[platform.key];
}

function resolve(settings: SiteSettings, platforms: readonly SocialPlatform[]) {
  return platforms.flatMap<ResolvedLink>((platform) => {
    const value = stored(settings, platform);
    // The filter that makes an empty field render nothing: the entry never
    // reaches the markup, so there is no wrapper, no gap and no empty tile —
    // which is different from rendering a hidden node.
    if (!value) return [];
    return [
      {
        key: platform.key,
        href: platform.toHref(value),
        display: platform.toDisplay(value),
      },
    ];
  });
}

export function contactLinks(settings: SiteSettings): ResolvedLink[] {
  return resolve(settings, CONTACT_PLATFORMS);
}

export function followLinks(settings: SiteSettings): ResolvedLink[] {
  return resolve(settings, FOLLOW_PLATFORMS);
}

const HEADING = 'mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold';

/** WhatsApp keeps its brand green; Email takes the site's own brand gradient. */
/**
 * Both tones are measured, not picked by eye.
 *
 * WhatsApp green is a fixed brand colour, and white on it is 1.98:1 — a plain
 * WCAG AA failure on the site's most prominent contact control. The charcoal
 * foreground is 9.86:1 and keeps the green itself recognisable, which swapping
 * to a darker green would not.
 *
 * Email uses `pill-grad`, not `gold-grad`. The latter is the gradient *text*
 * ramp, which on dark is light violet→blue tints: white on those measured
 * 3.68–4.23:1. `pill-grad` is the dark ramp reserved for white text, 5.17:1 at
 * its lightest stop. See the three-gradient note in globals.css.
 */
const PILL_TONE: Partial<Record<SocialKey, string>> = {
  whatsapp: 'bg-wa text-wa-fg hover:brightness-95',
  email: 'bg-pill-grad text-white hover:brightness-110',
};

/**
 * WhatsApp and Email as wide pills: mark, label, then the value itself.
 *
 * The value is wrapped in `<bdi dir="ltr">` rather than a plain `dir="ltr"`
 * span. `<bdi>` isolates the run, so a phone number sitting next to Arabic
 * label text cannot be reordered by the bidi algorithm — without it the digits
 * and the separator swap sides and the number reads backwards.
 */
export function ContactPills({
  locale,
  links,
  className = '',
}: {
  locale: Locale;
  links: ResolvedLink[];
  className?: string;
}) {
  if (links.length === 0) return null;
  const t = getT(locale);

  return (
    <div className={className}>
      <h3 className={HEADING}>{t('social.contact')}</h3>
      <div className="flex flex-col gap-3">
        {links.map((link) => {
          const Icon = SOCIAL_ICONS[link.key];
          const label = t(`social.names.${link.key}`);
          const href =
            link.key === 'whatsapp'
              ? `${link.href}?text=${encodeURIComponent(t('social.whatsappPrefill'))}`
              : link.href;

          return (
            <a
              key={link.key}
              href={href}
              {...(link.key === 'whatsapp'
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
              className={`flex w-full items-center gap-3 rounded-full px-5 py-3.5 text-sm font-semibold shadow-card transition ${PILL_TONE[link.key] ?? ''}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {/*
                The label holds its line and the value truncates instead: a
                two-line label made the Email pill taller than the WhatsApp one
                beside it in Arabic, where «البريد الإلكتروني» is far longer
                than «واتساب».
              */}
              <span className="shrink-0 whitespace-nowrap">{label}</span>
              <span aria-hidden="true" className="shrink-0 opacity-60">
                ·
              </span>
              <bdi dir="ltr" className="truncate font-normal opacity-95">
                {link.display}
              </bdi>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The remaining platforms as icon-only tiles.
 *
 * No visible text, so each tile carries its platform name as its accessible
 * name — an unlabelled link is unusable with a screen reader, and the mark
 * inside is `aria-hidden` because it is decoration once the link is named.
 *
 * Plain `flex`, never `flex-row-reverse`: the document's `dir` already mirrors
 * the row in Arabic, and reversing it here would undo that and put the tiles
 * back in latin order.
 */
export function FollowTiles({
  locale,
  links,
  className = '',
}: {
  locale: Locale;
  links: ResolvedLink[];
  className?: string;
}) {
  if (links.length === 0) return null;
  const t = getT(locale);

  return (
    <div className={className}>
      <h3 className={HEADING}>{t('social.follow')}</h3>
      <ul className="flex flex-wrap gap-2.5">
        {links.map((link) => {
          const Icon = SOCIAL_ICONS[link.key];
          return (
            <li key={link.key}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label={t(`social.names.${link.key}`)}
                className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-surface text-fg shadow-card transition-colors hover:border-gold hover:text-gold"
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

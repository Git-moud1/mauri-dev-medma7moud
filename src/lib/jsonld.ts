import type { Locale } from '@/i18n/config';
import { LOCALES } from '@/i18n/config';
import { dictionaries } from '@/i18n/dictionaries';
import type { SiteSettings, StoredProject } from '@/lib/content/types';
import { FOLLOW_KEYS } from '@/lib/social';
import { SITE, SITE_URL, TECH_STACK } from '@/lib/site';

/**
 * The structured data the site publishes, as one `@graph`.
 *
 * A single graph rather than four separate `<script>` tags: the nodes reference
 * each other by `@id` — the site is published by the person, the business was
 * founded by the same person, each project is a work they created — and a
 * parser only resolves those references when the nodes arrive together.
 *
 * Everything here is already on the page in human-readable form. This describes
 * it; it never states anything the visitor cannot also read, which is both the
 * rule Google enforces and the reason the values are read from the same
 * settings and dictionaries the components render.
 */

/** `@id`s, so a node can be pointed at instead of repeated. */
const PERSON_ID = `${SITE_URL}/#person`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const BUSINESS_ID = `${SITE_URL}/#business`;

/** Schema.org wants absolute URLs; the app stores image paths root-relative. */
function absolute(path: string): string {
  return path.startsWith('http') ? path : `${SITE_URL}${path}`;
}

/**
 * The profile URLs the owner has published, for `sameAs`.
 *
 * Read from the admin's settings rather than from a constant: `sameAs` is a
 * claim that these accounts are the same entity as this site, so it has to
 * follow what the owner actually publishes. A platform they clear disappears
 * from the graph on the next revalidation, exactly as it disappears from the
 * footer.
 */
function sameAs(settings: SiteSettings): { sameAs?: string[] } {
  const profiles = FOLLOW_KEYS.flatMap((key) => {
    const value = settings.socials[key];
    return value ? [value] : [];
  });

  // An owner who has published no profiles gets no key at all. `sameAs: []` is
  // a claim about identity with nothing in it, and the local fallback settings
  // put exactly that in the graph on every page.
  return profiles.length > 0 ? { sameAs: profiles } : {};
}

function person(settings: SiteSettings) {
  return {
    '@type': 'Person',
    '@id': PERSON_ID,
    name: SITE.altName,
    jobTitle: SITE.roleKey,
    url: SITE_URL,
    ...(settings.email ? { email: settings.email } : {}),
    // The tab icon, which is the brand mark on a solid ground — the one image
    // on the site that is a portrait of the entity rather than of the work.
    image: absolute('/icon.png'),
    worksFor: { '@id': BUSINESS_ID },
    knowsAbout: [...TECH_STACK],
    knowsLanguage: [...LOCALES],
    ...sameAs(settings),
  };
}

function website(locale: Locale) {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE_URL,
    name: SITE.name,
    alternateName: `${SITE.name} — ${SITE.tagline}`,
    description: dictionaries[locale].meta.description,
    inLanguage: [...LOCALES],
    publisher: { '@id': PERSON_ID },
  };
}

function business(locale: Locale, settings: SiteSettings) {
  const dict = dictionaries[locale];

  return {
    '@type': 'ProfessionalService',
    '@id': BUSINESS_ID,
    name: SITE.name,
    slogan: SITE.tagline,
    description: dict.meta.description,
    url: SITE_URL,
    image: absolute('/icon.png'),
    founder: { '@id': PERSON_ID },
    /**
     * Mauritania is where the work is done and where a local search should find
     * it; everything else is served remotely, which the second entry says once
     * rather than as a list of every country that might commission something.
     */
    areaServed: [
      { '@type': 'Country', name: 'Mauritania' },
      { '@type': 'Place', name: 'Worldwide' },
    ],
    availableLanguage: [...LOCALES],
    knowsLanguage: [...LOCALES],
    serviceType: [
      'Web application development',
      'Mobile app development',
      'Back-end and API development',
    ],
    ...(settings.whatsappNumber || settings.email
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            ...(settings.whatsappNumber
              ? { telephone: `+${settings.whatsappNumber}` }
              : {}),
            ...(settings.email ? { email: settings.email } : {}),
            availableLanguage: [...LOCALES],
          },
        }
      : {}),
    ...sameAs(settings),
  };
}

/**
 * The portfolio, as an ordered list of works.
 *
 * `position` follows the render order, which is the owner's own ordering in the
 * admin — newest first — so the list a crawler reads is the list a visitor
 * sees. Only the projects actually rendered on the page are listed: the
 * homepage shows a six-project preview and the catalogue page shows all of
 * them, and a list that named works the page does not contain is the mismatch
 * Google penalises.
 */
function portfolio(locale: Locale, projects: StoredProject[], path: string) {
  return {
    '@type': 'ItemList',
    '@id': `${SITE_URL}${path}#portfolio`,
    name: `${dictionaries[locale].projects.title} ${dictionaries[locale].projects.titleStrong}`,
    numberOfItems: projects.length,
    itemListElement: projects.map((project, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'CreativeWork',
        '@id': `${SITE_URL}${path}#project-${project.id}`,
        name: project.title[locale],
        description: project.description[locale],
        image: absolute(project.cover),
        inLanguage: locale,
        creator: { '@id': PERSON_ID },
        // A live product the client can open, when there is one. Projects under
        // NDA or since taken down carry no link, and an invented one would be a
        // dead URL in the graph.
        ...(project.link ? { url: project.link } : {}),
      },
    })),
  };
}

export function siteGraph(options: {
  locale: Locale;
  settings: SiteSettings;
  /** Exactly the projects the page renders, in the order it renders them. */
  projects: StoredProject[];
  /** Root-relative path of the page carrying this graph. */
  path: string;
}): object {
  const { locale, settings, projects, path } = options;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      person(settings),
      website(locale),
      business(locale, settings),
      portfolio(locale, projects, path),
    ],
  };
}

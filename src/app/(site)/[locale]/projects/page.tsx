import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { isLocale, dirFor } from '@/i18n/locale';
import { LOCALES } from '@/i18n/config';
import { dictionaries } from '@/i18n/dictionaries';
import { getT } from '@/i18n/server';
import { getProjects, getSettings } from '@/lib/content';
import { Providers } from '@/app/providers';
import { Header } from '@/components/Header';
import { Projects } from '@/components/Projects';
import { Footer } from '@/components/Footer';
import { contactLinks, followLinks } from '@/components/SocialLinks';
import { FloatingWhatsApp } from '@/components/islands/FloatingWhatsApp';
import { ArrowRightIcon } from '@/components/Icons';

/**
 * The full catalogue, which the homepage's six-project preview links to.
 *
 * Prerendered per locale exactly like `/[locale]`, and for the same reason: the
 * content reads are cached and tagged, so touching them must not turn this into
 * a dynamic route. Check the build output still lists `/[locale]/projects` as
 * SSG after editing anything here.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const dict = dictionaries[locale];

  return {
    // The layout's template appends the site name, so this is the page part only.
    title: `${dict.projects.allTitle} ${dict.projects.allTitleStrong}`,
    description: dict.projects.allSubtitle,
    alternates: {
      canonical: `/${locale}/projects`,
      languages: {
        ar: '/ar/projects',
        en: '/en/projects',
        fr: '/fr/projects',
        'x-default': '/ar/projects',
      },
    },
  };
}

export default async function ProjectsPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const [projects, settings] = await Promise.all([getProjects(), getSettings()]);
  const t = getT(locale);
  const dir = dirFor(locale);

  const contact = contactLinks(settings);
  const follow = followLinks(settings);

  return (
    <Providers locale={locale}>
      <Header locale={locale} whatsappUrl={settings.whatsappUrl} />
      <main>
        {/*
          `pt-32` clears the fixed header, which the homepage's hero handles with
          its own top padding. Without it the section label sits under the nav.
        */}
        <div className="pt-24 sm:pt-28">
          <Projects locale={locale} projects={projects} heading="all" showFilters />
        </div>

        {/*
          A way back. The header logo also goes home, but a visitor who arrived
          here from a search result has no history to go back through, and the
          page is long enough that the header is off-screen by the end of it.
        */}
        <div className="container-x pb-20 text-center sm:pb-28">
          <Link
            href={`/${locale}`}
            className="focus-visible:ring-offset-bg inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <ArrowRightIcon className={`h-4 w-4 ${dir === 'rtl' ? '' : 'rotate-180'}`} />
            {t('projects.backHome')}
          </Link>
        </div>
      </main>
      <Footer locale={locale} contact={contact} follow={follow} />
      <FloatingWhatsApp whatsappUrl={settings.whatsappUrl} />
    </Providers>
  );
}

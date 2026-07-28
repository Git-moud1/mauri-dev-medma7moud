import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/locale';
import { getProjects, getSettings } from '@/lib/content';
import { Providers } from '@/app/providers';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { TechMarquee } from '@/components/TechMarquee';
import { About } from '@/components/About';
import { Projects } from '@/components/Projects';
import { Process } from '@/components/Process';
import { Contact } from '@/components/Contact';
import { Footer } from '@/components/Footer';
import { FloatingWhatsApp } from '@/components/islands/FloatingWhatsApp';

/**
 * Every section below is a server component. `Providers` is a client boundary,
 * but its children are passed in as an already-rendered subtree, so nothing
 * here ships to the browser except the islands the sections themselves embed.
 *
 * Content comes from the store, read once here and passed down. Both reads are
 * wrapped in `unstable_cache` and tagged `content`, which is what keeps this
 * route statically prerendered between edits — check the build output still
 * lists `/[locale]` as SSG after touching anything here, because a dynamic
 * route forfeits the CDN HTML the whole architecture is built on.
 *
 * Neither read can fail: both fall back to the bundled catalogue.
 */
export default async function Home(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const [projects, settings] = await Promise.all([getProjects(), getSettings()]);

  return (
    <Providers locale={locale}>
      <Header locale={locale} whatsappUrl={settings.whatsappUrl} />
      <main>
        <Hero
          locale={locale}
          stats={settings.heroStats}
          availableForWork={settings.availableForWork}
          whatsappUrl={settings.whatsappUrl}
        />
        <TechMarquee locale={locale} />
        <About locale={locale} />
        <Projects locale={locale} projects={projects} />
        <Process locale={locale} />
        <Contact locale={locale} whatsappUrl={settings.whatsappUrl} />
      </main>
      <Footer
        locale={locale}
        whatsappUrl={settings.whatsappUrl}
        socials={settings.socials}
      />
      <FloatingWhatsApp whatsappUrl={settings.whatsappUrl} />
    </Providers>
  );
}

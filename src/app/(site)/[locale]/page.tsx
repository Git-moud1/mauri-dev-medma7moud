import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/locale';
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
 */
export default async function Home(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  return (
    <Providers locale={locale}>
      <Header locale={locale} />
      <main>
        <Hero locale={locale} />
        <TechMarquee locale={locale} />
        <About locale={locale} />
        <Projects locale={locale} />
        <Process locale={locale} />
        <Contact locale={locale} />
      </main>
      <Footer locale={locale} />
      <FloatingWhatsApp />
    </Providers>
  );
}

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
import { FloatingWhatsApp } from '@/components/WhatsApp';

export default async function Home(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  return (
    <Providers locale={locale}>
      <Header />
      <main>
        <Hero />
        <TechMarquee />
        <About />
        <Projects />
        <Process />
        <Contact />
      </main>
      <Footer />
      <FloatingWhatsApp />
    </Providers>
  );
}

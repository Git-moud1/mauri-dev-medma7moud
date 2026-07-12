import { DocumentMeta } from '@/components/DocumentMeta';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { TechMarquee } from '@/components/TechMarquee';
import { About } from '@/components/About';
import { Projects } from '@/components/Projects';
import { Process } from '@/components/Process';
import { Contact } from '@/components/Contact';
import { Footer } from '@/components/Footer';
import { FloatingWhatsApp } from '@/components/WhatsApp';

export default function Home() {
  return (
    <>
      <DocumentMeta />
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
    </>
  );
}

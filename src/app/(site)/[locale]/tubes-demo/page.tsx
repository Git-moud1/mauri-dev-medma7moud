import type { Metadata } from 'next';

import DemoOne from '@/components/ui/demo';

/**
 * A route that renders the TubesCursor demo, and nothing else.
 *
 * Its own page rather than a section of `/[locale]`, because the component is
 * `h-screen w-screen` with a `fixed` canvas — it covers the viewport by design
 * and would sit over any page it were dropped into. It also carries ~760 KB with
 * three.js bundled inside it and runs its own `WebGLRenderer` and rAF loop, so on
 * a shared route every visitor would pay for an effect they did not ask for.
 * Here, only people who open this URL do.
 */
export const metadata: Metadata = {
  title: 'TubesCursor — component demo',
  // A scratch route for evaluating a dependency, not part of the portfolio.
  robots: { index: false, follow: false },
};

export default function TubesDemoPage() {
  return <DemoOne />;
}

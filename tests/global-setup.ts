import { chromium, type FullConfig } from '@playwright/test';

/**
 * Warms the next/image optimizer cache before the suite runs.
 *
 * sharp re-encodes every image on first request. Without this, the first test
 * to load the page races every other worker for optimizer capacity and the
 * page never reaches networkidle inside its timeout.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(baseURL, { waitUntil: 'load' });
  // Scroll the full page so lazy-loaded project images are requested too.
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let y = 0;
      const step = () => {
        y += window.innerHeight;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 100);
        else resolve();
      };
      step();
    });
  });
  await page.waitForLoadState('networkidle').catch(() => {
    // Best-effort warm-up: a timeout here is not a test failure.
  });
  await browser.close();
}

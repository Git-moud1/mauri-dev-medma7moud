import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  // The next/image optimizer is CPU-bound on sharp. Unbounded workers stampede
  // it on a cold cache and it starts returning 500s. Two workers keeps the
  // suite honest without serialising it entirely.
  workers: process.env.CI ? 2 : 4,
  // Runs after the webServer plugin has brought the server up (Playwright
  // sets plugins up before global setup), so the warm-up can actually reach it.
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: 'http://localhost:3000',
        // Never reuse. A server left running by an earlier session keeps
        // answering with the build it started with, so the entire suite would
        // green against code that is not in the working tree — silently, since
        // nothing in the output says which build replied. Playwright errors out
        // if the port is occupied, which is the correct outcome: fix the port,
        // do not test whatever happens to be listening on it.
        reuseExistingServer: false,
        timeout: 180_000,
      },
});

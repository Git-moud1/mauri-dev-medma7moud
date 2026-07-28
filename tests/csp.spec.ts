import { test, expect } from '@playwright/test';

/**
 * PROTECTED TESTS — do not weaken, skip, or delete.
 *
 * These read `next.config.mjs` directly under each NODE_ENV, so they fail on a
 * developer's machine the moment a dev-only relaxation leaks into the
 * production branch — before anything is pushed, and without needing a deploy.
 *
 * `tests/headers.spec.ts` asserts the same property on the delivered response.
 * Both exist on purpose: config and delivery are different things, which is the
 * whole lesson of plan 1's task 12.
 */
async function cspFor(nodeEnv: 'development' | 'production'): Promise<string> {
  // Typed as always-set by @types/node, so it is captured as a plain string
  // rather than defaulted with `??` — which the linter correctly calls dead.
  const saved: string = process.env.NODE_ENV;
  // NODE_ENV is read-only in the Next types but writable at runtime; the config
  // module reads it at import time, so it has to be set before the import and
  // the module cache busted between the two reads.
  (process.env as Record<string, string>).NODE_ENV = nodeEnv;

  const config = (await import(`../next.config.mjs?env=${nodeEnv}`)) as {
    default: { headers: () => Promise<{ headers: { key: string; value: string }[] }[]> };
  };
  const groups = await config.default.headers();
  const found = groups
    .flatMap((group) => group.headers)
    .find((header) => header.key === 'Content-Security-Policy');
  const csp = found ? found.value : '';

  (process.env as Record<string, string>).NODE_ENV = saved;
  return csp;
}

test.describe('CSP by environment', () => {
  test('production allows no eval and no websockets', async () => {
    const csp = await cspFor('production');
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('ws:');
  });

  test('development allows both, because React and HMR need them', async () => {
    const csp = await cspFor('development');
    expect(csp).toContain('unsafe-eval');
    expect(csp).toContain('ws:');
  });

  test('the strict directives are identical in both environments', async () => {
    const dev = await cspFor('development');
    const prod = await cspFor('production');
    for (const directive of [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "default-src 'self'",
    ]) {
      expect(dev, `dev dropped ${directive}`).toContain(directive);
      expect(prod, `production dropped ${directive}`).toContain(directive);
    }
  });
});

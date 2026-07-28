import { test, expect } from '@playwright/test';
import { hash } from '@node-rs/argon2';
import { verifyPassword } from '../src/lib/auth/password';
import { createSession, verifySession } from '../src/lib/auth/session';

/**
 * These run in the Node process, not a browser, so they can set the env vars
 * the primitives read. No real secret appears here — the fixture password and
 * secret are generated for this file and are meaningless outside it.
 */
const FIXTURE_PASSWORD = 'correct-horse-battery-staple';

test.describe('auth primitives', () => {
  test.beforeAll(async () => {
    process.env.ADMIN_PASSWORD_HASH = await hash(FIXTURE_PASSWORD);
    process.env.AUTH_SECRET = 'test-only-secret-'.padEnd(48, 'x');
  });

  test('the correct password verifies', async () => {
    expect(await verifyPassword(FIXTURE_PASSWORD)).toBe(true);
  });

  test('a wrong password does not', async () => {
    expect(await verifyPassword('hunter2')).toBe(false);
  });

  test('an empty password does not', async () => {
    expect(await verifyPassword('')).toBe(false);
  });

  /**
   * The failure mode that matters most: an unset env var must not read as
   * "no password required". A naive `stored === candidate` check passes when
   * both sides are undefined, which would leave the admin panel wide open on
   * any deploy where the variable was forgotten.
   */
  test('verification fails closed when the hash env var is missing', async () => {
    const saved = process.env.ADMIN_PASSWORD_HASH;
    delete process.env.ADMIN_PASSWORD_HASH;
    expect(await verifyPassword('anything')).toBe(false);
    expect(await verifyPassword('')).toBe(false);
    process.env.ADMIN_PASSWORD_HASH = saved;
  });

  test('verification fails closed on a malformed hash', async () => {
    const saved = process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD_HASH = 'not-an-argon2-hash';
    expect(await verifyPassword(FIXTURE_PASSWORD)).toBe(false);
    process.env.ADMIN_PASSWORD_HASH = saved;
  });

  test('a session round-trips', async () => {
    expect(await verifySession(await createSession())).toBe(true);
  });

  test('a tampered token is rejected', async () => {
    const token = await createSession();
    expect(await verifySession(`${token.slice(0, -3)}aaa`)).toBe(false);
  });

  test('an absent token is rejected', async () => {
    expect(await verifySession(undefined)).toBe(false);
    expect(await verifySession('')).toBe(false);
  });

  /** A token signed with a different secret must not verify — that is the whole
   *  point of AUTH_SECRET being a secret. */
  test('a token signed with another secret is rejected', async () => {
    const token = await createSession();
    const saved = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'a-completely-different-secret-'.padEnd(48, 'y');
    expect(await verifySession(token)).toBe(false);
    process.env.AUTH_SECRET = saved;
  });

  test('session verification fails closed when AUTH_SECRET is missing', async () => {
    const token = await createSession();
    const saved = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    expect(await verifySession(token)).toBe(false);
    process.env.AUTH_SECRET = saved;
  });
});

/**
 * PROTECTED TEST — do not weaken, skip, or delete.
 *
 * `ADMIN_PASSWORD_HASH` holds the base64 of an argon2id hash, not the hash.
 * An argon2 hash is `$argon2id$v=19$m=…`, and `@next/env` runs dotenv-expand
 * over every .env file, expanding each `$name` to nothing. Verified directly
 * against @next/env: plain, double-quoted, single-quoted and backslash-escaped
 * values are ALL destroyed, so there is no quoting that would let a raw hash
 * live in .env.local.
 *
 * The trap is that Netlify's dashboard does no expansion, so a raw hash works
 * in production while every local login fails. Both forms are therefore
 * accepted, and both are asserted here — dropping either one resurrects a bug
 * that costs an hour to find.
 */
test.describe('password hash encoding', () => {
  const PASSWORD = 'encoding-fixture-password';

  test('accepts a base64-encoded hash', async () => {
    const raw = await hash(PASSWORD);
    const saved = process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD_HASH = Buffer.from(raw, 'utf8').toString('base64');
    expect(await verifyPassword(PASSWORD)).toBe(true);
    expect(await verifyPassword('wrong')).toBe(false);
    process.env.ADMIN_PASSWORD_HASH = saved;
  });

  test('still accepts a raw hash, as set by hand in a dashboard', async () => {
    const raw = await hash(PASSWORD);
    const saved = process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD_HASH = raw;
    expect(await verifyPassword(PASSWORD)).toBe(true);
    process.env.ADMIN_PASSWORD_HASH = saved;
  });

  test('rejects base64 of something that is not an argon2 hash', async () => {
    const saved = process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD_HASH = Buffer.from('not-a-hash', 'utf8').toString(
      'base64',
    );
    expect(await verifyPassword(PASSWORD)).toBe(false);
    process.env.ADMIN_PASSWORD_HASH = saved;
  });
});

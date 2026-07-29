/**
 * TEMPORARY request-time diagnostics. DELETE once the preview login is fixed.
 *
 * `verifyPassword` fails closed on every path and the login action collapses
 * every failure into one message, which is correct security and useless
 * debugging: a missing variable, a mangled variable, a native module that will
 * not load on Linux and a genuinely wrong password are all "Incorrect
 * password." to the client. This module separates them, in the *function* log
 * only — nothing it produces is ever returned to the browser.
 *
 * ## The safety rule this file is written to
 *
 * Presence, length and shape. Never a value, never a substring of a value,
 * never the candidate password. Error strings from argon2 are passed through
 * `scrub` first, which replaces any occurrence of the raw environment values or
 * the decoded hash with `<redacted>` and then truncates. The self-test hashes a
 * literal throwaway string, so no real credential is involved in proving the
 * native module works.
 */

import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { getStore } from '@netlify/blobs';
import { storedHash } from './password';

const PROBE_PASSWORD = 'authdiag-probe-not-a-credential';

/**
 * Remove anything reversible before a third-party error message reaches a log.
 * The values are read fresh rather than captured, so this stays correct if the
 * module is imported before the environment is populated.
 */
function scrub(input: unknown): string {
  const text = input instanceof Error ? `${input.name}: ${input.message}` : String(input);
  const secrets = [process.env.ADMIN_PASSWORD_HASH, process.env.AUTH_SECRET, storedHash()];
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('<redacted>');
  }
  return out.slice(0, 200);
}

function describeVariable(raw: string | undefined) {
  if (!raw) return { present: false as const };
  return {
    present: true as const,
    length: raw.length,
    // Differs from `length` when a newline or space rode along with the paste.
    // Harmless for the base64 hash, fatal for AUTH_SECRET.
    trimmedLength: raw.trim().length,
  };
}

function describeHash() {
  const raw = process.env.ADMIN_PASSWORD_HASH;
  if (!raw) return { ...describeVariable(raw), shape: 'absent' as const, decodedLength: 0 };

  if (raw.startsWith('$argon2')) {
    return { ...describeVariable(raw), shape: 'raw-argon2' as const, decodedLength: raw.length };
  }

  // Buffer's base64 decoder never throws — it drops anything outside the
  // alphabet — so `unrecognised` is the only signal that the value was mangled.
  const decoded = Buffer.from(raw, 'base64').toString('utf8');
  return {
    ...describeVariable(raw),
    shape: decoded.startsWith('$argon2') ? ('base64-argon2' as const) : ('unrecognised' as const),
    decodedLength: decoded.length,
  };
}

/**
 * Prove the native argon2 binding actually loaded and runs on this platform.
 *
 * `@node-rs/argon2` is a Rust NAPI addon that resolves a per-platform `.node`
 * file at require time. The local machine loads `win32-x64-msvc`; the deploy
 * needs `linux-x64-gnu` to have been traced into the function bundle. If it was
 * not, `verify` throws, `verifyPassword` catches, and the login reports a wrong
 * password — with the correct password.
 */
async function probeArgon2(): Promise<Record<string, unknown>> {
  try {
    const probe = await argon2Hash(PROBE_PASSWORD);
    const roundTrip = await argon2Verify(probe, PROBE_PASSWORD);
    return { native: 'loaded', selfTest: roundTrip ? 'pass' : 'FAIL-returned-false' };
  } catch (error) {
    return { native: 'FAILED-TO-RUN', selfTest: 'n/a', nativeError: scrub(error) };
  }
}

/**
 * Feed the *stored* hash to the verifier with a password that is definitely
 * wrong. A clean `false` means the hash parses and the only remaining variable
 * is the password itself. A throw means the stored hash is malformed even
 * though it decoded to something starting `$argon2`.
 */
async function probeStoredHash(): Promise<Record<string, unknown>> {
  const hash = storedHash();
  if (!hash) return { storedHash: 'null-after-normalisation' };

  try {
    const result = await argon2Verify(hash, 'authdiag-deliberately-wrong');
    return { storedHash: 'parses', wrongPasswordReturns: result };
  } catch (error) {
    return { storedHash: 'THROWS-ON-VERIFY', verifyError: scrub(error) };
  }
}

/**
 * The rate limiter fails open on a store error, so `allowed: true` covers both
 * "no record" and "Blobs is unreachable". This tells the two apart.
 */
async function probeBlobs(): Promise<Record<string, unknown>> {
  try {
    await getStore('auth-attempts').get('authdiag-probe', { type: 'json' });
    return { blobs: 'reachable' };
  } catch (error) {
    return { blobs: 'unreachable', blobsError: scrub(error) };
  }
}

/**
 * Everything the request-time environment can be asked about without touching a
 * value. Shared by the login action's log line and the `/api/authdiag` route.
 */
export async function collectAuthDiagnostics(): Promise<Record<string, unknown>> {
  const [argon2, stored, blobs] = await Promise.all([
    probeArgon2(),
    probeStoredHash(),
    probeBlobs(),
  ]);

  return {
    // Confirms which build is answering, so a stale published deploy is visible
    // rather than assumed away.
    context: process.env.CONTEXT ?? 'none',
    commit: process.env.COMMIT_REF?.slice(0, 7) ?? 'none',
    deployId: process.env.DEPLOY_ID ?? 'none',
    hash: describeHash(),
    secret: describeVariable(process.env.AUTH_SECRET),
    ...argon2,
    ...stored,
    ...blobs,
  };
}

export interface LoginDiagnosticsInput {
  /** Which header supplied the rate-limit key. Never the address itself. */
  ipSource: string;
  rateLimitAllowed: boolean;
  retryAfterSeconds: number;
  passwordAccepted: boolean;
}

export async function logLoginDiagnostics(input: LoginDiagnosticsInput): Promise<void> {
  console.log(
    '[authdiag:runtime] ' + JSON.stringify({ ...(await collectAuthDiagnostics()), ...input }),
  );
}

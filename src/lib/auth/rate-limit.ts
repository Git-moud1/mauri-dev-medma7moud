import { getStore } from '@netlify/blobs';

const STORE = 'auth-attempts';
const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 600;
const LOCKOUT_SECONDS = 900;

interface AttemptRecord {
  count: number;
  first: number;
  lockedUntil?: number;
}

/**
 * Namespaced and sanitised: the IP arrives from a request header, so it is
 * attacker-influenced, and an unfiltered value could collide with another
 * blob key or escape the intended namespace.
 */
function key(ip: string): string {
  return `login:${ip.replace(/[^a-zA-Z0-9.:_-]/g, '_')}`;
}

/**
 * Five failures per ten minutes per IP, then a fifteen-minute lockout.
 *
 * Fails OPEN on a store error, deliberately. The password check is the actual
 * gate; this only raises the cost of guessing at it. A Blobs outage locking the
 * owner out of their own admin panel would be a self-inflicted denial of
 * service, and an attacker cannot cause the outage to get more attempts.
 */
export async function checkRateLimit(
  ip: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  try {
    const record: unknown = await getStore(STORE).get(key(ip), { type: 'json' });
    if (!record) return { allowed: true, retryAfterSeconds: 0 };

    const attempt = record as AttemptRecord;
    const now = Date.now();

    if (attempt.lockedUntil && attempt.lockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((attempt.lockedUntil - now) / 1000),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export async function recordFailure(ip: string): Promise<void> {
  try {
    const store = getStore(STORE);
    const now = Date.now();
    const existing = (await store.get(key(ip), { type: 'json' })) as AttemptRecord | null;

    // A window that has expired starts a fresh count rather than accumulating
    // forever — otherwise five typos spread over a year would lock the owner
    // out on the fifth.
    const withinWindow = existing && now - existing.first < WINDOW_SECONDS * 1000;
    const next: AttemptRecord = withinWindow
      ? { count: existing.count + 1, first: existing.first }
      : { count: 1, first: now };

    if (next.count >= MAX_ATTEMPTS) next.lockedUntil = now + LOCKOUT_SECONDS * 1000;

    await store.setJSON(key(ip), next);
  } catch {
    // A failed write must not turn a wrong password into a 500.
  }
}

export async function clearAttempts(ip: string): Promise<void> {
  try {
    await getStore(STORE).delete(key(ip));
  } catch {
    // Non-fatal: the record expires on its own window.
  }
}

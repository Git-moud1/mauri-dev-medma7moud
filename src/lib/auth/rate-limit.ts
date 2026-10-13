import { authAttemptsStore } from '@/lib/blobs';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 600;
const LOCKOUT_SECONDS = 900;

interface AttemptRecord {
  count: number;
  /** Epoch milliseconds of the first failure in the current window. */
  firstAt: number;
  /** Epoch milliseconds, or null when not locked. */
  lockedUntil: number | null;
}

/**
 * Sanitised: the IP arrives from a request header, so it is
 * attacker-influenced. It is only ever a blob key here, but a value that can be
 * anything is a value that will eventually be somewhere it should not be.
 */
function key(ip: string, scope?: Scope): string {
  const id = ip.replace(/[^a-zA-Z0-9.:_-]/g, '_');
  // Login keys stay unprefixed so records written before scopes existed still count.
  return scope && scope !== 'login' ? `${scope}:${id}` : id;
}

/**
 * Separate counters per surface, so guessing at the reset form does not lock
 * the owner out of signing in, and the reverse.
 */
export type Scope = 'login' | 'change-password' | 'reset' | 'forgot';

function parseRecord(value: unknown): AttemptRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Partial<AttemptRecord>;
  if (typeof record.count !== 'number' || typeof record.firstAt !== 'number') return null;
  return {
    count: record.count,
    firstAt: record.firstAt,
    lockedUntil: typeof record.lockedUntil === 'number' ? record.lockedUntil : null,
  };
}

async function read(
  id: string,
): Promise<{ record: AttemptRecord | null; etag?: string }> {
  const result = await authAttemptsStore().getWithMetadata(id, { type: 'json' });
  if (result === null) return { record: null };
  return { record: parseRecord(result.data), etag: result.etag };
}

/**
 * Five failures per ten minutes per IP, then a fifteen-minute lockout.
 *
 * Fails OPEN on a store error, deliberately, and this is the one place in the
 * app that still swallows one. The password check is the actual gate; this only
 * raises the cost of guessing at it. A store outage locking the owner out of
 * their own admin panel would be a self-inflicted denial of service, and an
 * attacker cannot cause the outage in order to earn more attempts.
 *
 * Everything the public site renders throws on a failed read instead. The
 * difference is what the failure costs: stale portfolio content shipped
 * silently is the bug this store exists to prevent, whereas a rate limiter that
 * misses a window is a slightly cheaper brute force against an argon2 hash.
 */
export async function checkRateLimit(
  ip: string,
  scope: Scope = 'login',
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  try {
    const { record } = await read(key(ip, scope));
    const now = Date.now();
    if (record?.lockedUntil && record.lockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * Conditional on the etag it read, so two failures racing each other cannot
 * both write `count + 1` from the same starting value. The loser is not
 * retried: under-counting one guess is the fail-open trade described above.
 */
export async function recordFailure(ip: string, scope: Scope = 'login'): Promise<void> {
  try {
    const id = key(ip, scope);
    const now = Date.now();
    const { record, etag } = await read(id);

    // A window that has expired starts a fresh count rather than accumulating
    // forever — otherwise five typos spread over a year would lock the owner
    // out on the fifth.
    const withinWindow = record !== null && now - record.firstAt < WINDOW_SECONDS * 1000;
    const count = withinWindow ? record.count + 1 : 1;

    const next: AttemptRecord = {
      count,
      firstAt: withinWindow ? record.firstAt : now,
      lockedUntil: count >= MAX_ATTEMPTS ? now + LOCKOUT_SECONDS * 1000 : null,
    };

    await authAttemptsStore().set(
      id,
      JSON.stringify(next),
      etag ? { onlyIfMatch: etag } : { onlyIfNew: true },
    );
  } catch {
    // A failed write must not turn a wrong password into a 500.
  }
}

export async function clearAttempts(ip: string, scope: Scope = 'login'): Promise<void> {
  try {
    await authAttemptsStore().delete(key(ip, scope));
  } catch {
    // Non-fatal: the record expires on its own window.
  }
}

/**
 * A plain counter: may this happen again inside the window? Used to cap how
 * often anyone can make the site send a reset email.
 *
 * Unlike the login limiter this FAILS CLOSED — on a store error, or on losing a
 * race for the counter, the answer is no. The cost of a wrong "no" is one
 * delayed email; the cost of a wrong "yes" is an inbox anyone can flood.
 */
export async function consumeQuota(
  name: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const store = authAttemptsStore();
    const id = `quota:${name.replace(/[^a-zA-Z0-9.:_-]/g, '_')}`;
    const now = Date.now();
    // Typed by the SDK as never null; a missing key returns null at runtime.
    const current = (await store.getWithMetadata(id, { type: 'json' })) as {
      data: unknown;
      etag?: string;
    } | null;
    const record = (current?.data ?? {}) as { count?: unknown; since?: unknown };

    const since = typeof record.since === 'number' ? record.since : now;
    const fresh = now - since >= windowSeconds * 1000;
    const count = !fresh && typeof record.count === 'number' ? record.count : 0;
    if (count >= max) return false;

    const body = JSON.stringify({ count: count + 1, since: fresh ? now : since });
    const result = await store.set(
      id,
      body,
      current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );
    return result.modified && Boolean(result.etag);
  } catch {
    return false;
  }
}

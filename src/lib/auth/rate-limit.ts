import { supabase } from '@/lib/supabase';

const TABLE = 'auth_attempts';
const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 600;
const LOCKOUT_SECONDS = 900;

/**
 * Sanitised: the IP arrives from a request header, so it is
 * attacker-influenced. It is only ever a primary key here, but a value that can
 * be anything is a value that will eventually be somewhere it should not be.
 */
function key(ip: string): string {
  return ip.replace(/[^a-zA-Z0-9.:_-]/g, '_');
}

/**
 * Five failures per ten minutes per IP, then a fifteen-minute lockout.
 *
 * Fails OPEN on a store error, deliberately, and this is the one place in the
 * app that still swallows one. The password check is the actual gate; this only
 * raises the cost of guessing at it. A database outage locking the owner out of
 * their own admin panel would be a self-inflicted denial of service, and an
 * attacker cannot cause the outage in order to earn more attempts.
 *
 * Everything the public site renders now throws on a failed read instead. The
 * difference is what the failure costs: stale portfolio content shipped
 * silently is the bug this migration exists to fix, whereas a rate limiter that
 * misses a window is a slightly cheaper brute force against an argon2 hash.
 */
export async function checkRateLimit(
  ip: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  try {
    const { data, error } = await supabase()
      .from(TABLE)
      .select('count, first_at, locked_until')
      .eq('ip', key(ip))
      .maybeSingle();

    if (error || !data?.locked_until) return { allowed: true, retryAfterSeconds: 0 };

    const lockedUntil = new Date(data.locked_until).getTime();
    const now = Date.now();
    if (lockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export async function recordFailure(ip: string): Promise<void> {
  try {
    const client = supabase();
    const id = key(ip);
    const now = Date.now();

    const { data: existing } = await client
      .from(TABLE)
      .select('count, first_at, locked_until')
      .eq('ip', id)
      .maybeSingle();

    // A window that has expired starts a fresh count rather than accumulating
    // forever — otherwise five typos spread over a year would lock the owner
    // out on the fifth.
    const firstAt = existing ? new Date(existing.first_at).getTime() : now;
    const withinWindow = existing !== null && now - firstAt < WINDOW_SECONDS * 1000;

    const count = withinWindow ? existing.count + 1 : 1;
    const first = withinWindow ? new Date(firstAt) : new Date(now);

    await client.from(TABLE).upsert(
      {
        ip: id,
        count,
        first_at: first.toISOString(),
        locked_until:
          count >= MAX_ATTEMPTS
            ? new Date(now + LOCKOUT_SECONDS * 1000).toISOString()
            : null,
      },
      { onConflict: 'ip' },
    );
  } catch {
    // A failed write must not turn a wrong password into a 500.
  }
}

export async function clearAttempts(ip: string): Promise<void> {
  try {
    await supabase().from(TABLE).delete().eq('ip', key(ip));
  } catch {
    // Non-fatal: the record expires on its own window.
  }
}

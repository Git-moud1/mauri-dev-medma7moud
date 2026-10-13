'use server';

import { cookies } from 'next/headers';
import { hashPassword, newPasswordProblem, verifyAgainst } from '@/lib/auth/password';
import {
  readCredential,
  replaceCredential,
  CredentialConflictError,
} from '@/lib/auth/credential';
import { consumeResetToken, isTokenShaped, issueResetToken } from '@/lib/auth/reset';
import { clientIp, hasValidSession } from '@/lib/auth/request';
import {
  checkRateLimit,
  clearAttempts,
  consumeQuota,
  recordFailure,
} from '@/lib/auth/rate-limit';
import {
  createSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
} from '@/lib/auth/session';
import { mailer, recoveryAddress } from '@/lib/email';

export type AccountResult = { ok: true; message: string } | { ok: false; error: string };

/** FormDataEntryValue is `string | File`; anything but a string reads as ''. */
function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function lockedMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many attempts. Try again in ${minutes} minutes.`;
}

// ---------------------------------------------------------------------------
// Change password (signed in)
// ---------------------------------------------------------------------------

/**
 * Verify the current password, store the new hash, and end every other
 * session. The current one is re-issued at the new session version so the
 * owner stays signed in on the device they used.
 */
export async function changePassword(
  _previous: AccountResult | null,
  formData: FormData,
): Promise<AccountResult> {
  if (!(await hasValidSession())) return { ok: false, error: 'Not signed in.' };

  const ip = await clientIp();
  const limit = await checkRateLimit(ip, 'change-password');
  if (!limit.allowed) return { ok: false, error: lockedMessage(limit.retryAfterSeconds) };

  const current = field(formData, 'currentPassword');
  const next = field(formData, 'newPassword');
  const problem = newPasswordProblem(next, field(formData, 'confirmPassword'));
  if (problem) return { ok: false, error: problem };

  try {
    const credential = await readCredential();
    if (!credential || !(await verifyAgainst(credential.hash, current))) {
      await recordFailure(ip, 'change-password');
      return { ok: false, error: 'The current password is incorrect.' };
    }
    if (await verifyAgainst(credential.hash, next)) {
      return { ok: false, error: 'The new password must differ from the current one.' };
    }

    const sessionVersion = await replaceCredential(credential, await hashPassword(next));
    await clearAttempts(ip, 'change-password');
    (await cookies()).set(
      SESSION_COOKIE,
      await createSession(sessionVersion),
      SESSION_COOKIE_OPTIONS,
    );
    return {
      ok: true,
      message: 'Password changed. Every other signed-in session has been signed out.',
    };
  } catch (error) {
    if (error instanceof CredentialConflictError)
      return { ok: false, error: error.message };
    console.error('[auth] password change failed', error);
    return { ok: false, error: 'The password could not be changed. Nothing was saved.' };
  }
}

// ---------------------------------------------------------------------------
// Forgot password (signed out)
// ---------------------------------------------------------------------------

/** The same words whatever happened, so the form reveals nothing. */
const REQUEST_ACKNOWLEDGED =
  'If that is the admin address, a reset link is on its way. It works once and expires in 20 minutes.';

/**
 * Email a single-use reset link — to the fixed recovery address, and only when
 * the typed address matches it.
 *
 * Anti-enumeration: a matching address, a wrong one, and a rate-limited request
 * all get REQUEST_ACKNOWLEDGED. Anti-flooding: three requests per IP per hour
 * and ten per day site-wide, both failing closed.
 *
 * The one message that differs is "not configured", and it differs for every
 * input alike — it describes the site, not the address.
 */
export async function requestPasswordReset(
  _previous: AccountResult | null,
  formData: FormData,
): Promise<AccountResult> {
  const send = mailer();
  if (!send) {
    console.error(
      '[auth] password reset requested, but no mailer: RESEND_API_KEY is not set',
    );
    return {
      ok: false,
      error:
        'Password reset by email is not configured on this site yet. Contact the site owner.',
    };
  }

  const typed = field(formData, 'email').trim().toLowerCase();
  if (!typed || typed.length > 254) return { ok: true, message: REQUEST_ACKNOWLEDGED };

  const ip = await clientIp();
  const allowed =
    (await consumeQuota(`reset-ip:${ip}`, 3, 60 * 60)) &&
    (await consumeQuota('reset-site', 10, 24 * 60 * 60));
  if (!allowed || typed !== recoveryAddress()) {
    return { ok: true, message: REQUEST_ACKNOWLEDGED };
  }

  try {
    const { token } = await issueResetToken();
    // Fragment, not query string: a `#…` never reaches a server log, a CDN log
    // or a Referer header. The reset page reads it in the browser.
    const link = `${process.env.MD_PUBLIC_ORIGIN}/admin/reset#token=${token}`;
    await send.send({
      to: recoveryAddress(),
      subject: 'Reset your Mauri-Dev admin password',
      text:
        'Someone asked to reset the Mauri-Dev admin password.\n\n' +
        `Open this link within 20 minutes to choose a new password:\n${link}\n\n` +
        'It works once. If you did not ask for this, ignore this email — your password has not changed.',
      html:
        '<p>Someone asked to reset the Mauri-Dev admin password.</p>' +
        `<p><a href="${link}">Choose a new password</a> — the link works once and expires in 20 minutes.</p>` +
        '<p>If you did not ask for this, ignore this email. Your password has not changed.</p>',
    });
  } catch (error) {
    // Logged, not shown: the visitor learns nothing either way, and the owner
    // finds the cause in the function log.
    console.error('[auth] password reset email failed', error);
  }
  return { ok: true, message: REQUEST_ACKNOWLEDGED };
}

// ---------------------------------------------------------------------------
// Reset password (signed out, with a token)
// ---------------------------------------------------------------------------

const INVALID_LINK =
  'This reset link is invalid, already used, or expired. Request a new one from the sign-in page.';

/**
 * Consume the token, then store the new hash and end every session.
 *
 * Order matters. The password policy is checked BEFORE the token is consumed,
 * so a typo in the new password does not burn the link. The token is consumed
 * BEFORE the credential is written, so a raced second request can never set a
 * password. If the credential write then fails, the link is spent and the
 * password unchanged — the safe half to be left in; the owner requests another
 * link.
 */
export async function resetPassword(
  _previous: AccountResult | null,
  formData: FormData,
): Promise<AccountResult> {
  const ip = await clientIp();
  const limit = await checkRateLimit(ip, 'reset');
  if (!limit.allowed) return { ok: false, error: lockedMessage(limit.retryAfterSeconds) };

  const token = field(formData, 'token');
  if (!isTokenShaped(token)) {
    await recordFailure(ip, 'reset');
    return { ok: false, error: INVALID_LINK };
  }

  const next = field(formData, 'newPassword');
  const problem = newPasswordProblem(next, field(formData, 'confirmPassword'));
  if (problem) return { ok: false, error: problem };

  let consumed: boolean;
  try {
    consumed = await consumeResetToken(token);
  } catch (error) {
    console.error('[auth] reset token check failed', error);
    return { ok: false, error: 'The reset could not be completed. Nothing was changed.' };
  }
  if (!consumed) {
    await recordFailure(ip, 'reset');
    return { ok: false, error: INVALID_LINK };
  }

  try {
    const credential = await readCredential();
    if (!credential) throw new Error('no credential to replace');
    await replaceCredential(credential, await hashPassword(next));
  } catch (error) {
    console.error(
      '[auth] reset: credential write failed after the token was used',
      error,
    );
    return {
      ok: false,
      error:
        'The link was used, but the new password could not be saved, so the old one still ' +
        'works. Request a new link and try again.',
    };
  }

  await clearAttempts(ip, 'reset');
  // Signed out here too, whatever this browser held before.
  (await cookies()).delete(SESSION_COOKIE);
  return {
    ok: true,
    message:
      'Password changed. Every session has been signed out — sign in with the new one.',
  };
}

'use server';

import { cookies } from 'next/headers';
import { hashPassword, newPasswordProblem, verifyAgainst } from '@/lib/auth/password';
import {
  readCredential,
  replaceCredential,
  CredentialConflictError,
} from '@/lib/auth/credential';
import { randomBytes } from 'node:crypto';
import {
  consumeResetToken,
  isTokenShaped,
  issueResetToken,
  openResetToken,
  RESET_MAX_OPENS,
  RESET_TTL_MS,
  type LinkProblem,
} from '@/lib/auth/reset';
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

const TTL_MINUTES = Math.round(RESET_TTL_MS / 60000);

/**
 * Email a reset link to the admin address — only when the typed address IS
 * the admin address, and the answer says plainly which happened.
 *
 * Telling a visitor "that is not the admin email" reveals which address is the
 * admin's. That was a deliberate choice by the owner: the address is already
 * published on the site as the contact email, so there is nothing left to hide,
 * and a form that always says "maybe" left the owner unsure whether to wait.
 *
 * Limits, all reported in words:
 * - wrong addresses: five per IP in ten minutes, then a fifteen-minute lock;
 * - emails sent: five per IP per hour and twenty per day site-wide, failing
 *   closed (they also guard Resend's 100/day free quota).
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
      error: 'Password reset by email is not configured on this site yet.',
    };
  }

  const ip = await clientIp();
  const limit = await checkRateLimit(ip, 'forgot');
  if (!limit.allowed) return { ok: false, error: lockedMessage(limit.retryAfterSeconds) };

  const typed = field(formData, 'email').trim().toLowerCase();
  if (!typed || typed.length > 254) return { ok: false, error: 'Enter the admin email.' };
  if (typed !== recoveryAddress()) {
    await recordFailure(ip, 'forgot');
    return { ok: false, error: 'This is not the admin email.' };
  }
  await clearAttempts(ip, 'forgot');

  const allowed =
    (await consumeQuota(`reset-ip:${ip}`, 5, 60 * 60)) &&
    (await consumeQuota('reset-site', 20, 24 * 60 * 60));
  if (!allowed) {
    return {
      ok: false,
      error:
        'Too many reset emails were requested recently. Use the latest email, or try again in an hour.',
    };
  }

  try {
    const { token, expiresAt } = await issueResetToken();
    // Fragment, not query string: a `#…` never reaches a server log, a CDN log
    // or a Referer header. The reset page reads it in the browser.
    const link = `${process.env.MD_PUBLIC_ORIGIN}/admin/reset#token=${token}`;

    // Every email unique in subject AND body. Gmail threads messages with the
    // same subject and hides content that repeats an earlier message in the
    // thread — which made the second and third reset emails look empty.
    const ref = randomBytes(3).toString('hex').toUpperCase();
    const sentAt = new Date().toISOString().slice(11, 16);
    const until = new Date(expiresAt).toISOString().slice(11, 16);

    await send.send({
      to: recoveryAddress(),
      subject: `Mauri-Dev admin password reset · ${sentAt} UTC · #${ref}`,
      text:
        `Password reset requested at ${sentAt} UTC (request #${ref}).\n\n` +
        `Open this link to choose a new password:\n${link}\n\n` +
        `It works until ${until} UTC (${TTL_MINUTES} minutes), can be opened at most ` +
        `${RESET_MAX_OPENS} times, and sets a password once. A newer request replaces it.\n\n` +
        'If you did not ask for this, ignore this email — your password has not changed.',
      html:
        `<p>Password reset requested at <strong>${sentAt} UTC</strong> (request #${ref}).</p>` +
        `<p><a href="${link}"><strong>Choose a new password</strong></a></p>` +
        `<p>Works until <strong>${until} UTC</strong> (${TTL_MINUTES} minutes), opens at most ` +
        `${RESET_MAX_OPENS} times, sets a password once. A newer request replaces it.</p>` +
        `<p style="color:#666;word-break:break-all">If the button does not work, copy this address:<br>${link}</p>` +
        '<p style="color:#666">If you did not ask for this, ignore this email. Your password has not changed.</p>',
    });
  } catch (error) {
    console.error('[auth] password reset email failed', error);
    return { ok: false, error: 'The email could not be sent. Try again in a minute.' };
  }

  return {
    ok: true,
    message:
      `Email sent to the admin address. Check the inbox (and Spam). The link works for ` +
      `${TTL_MINUTES} minutes and can be opened ${RESET_MAX_OPENS} times.`,
  };
}

// ---------------------------------------------------------------------------
// Reset password (signed out, with a token)
// ---------------------------------------------------------------------------

const LINK_PROBLEM: Record<LinkProblem, string> = {
  invalid:
    'This link is not valid — a newer reset email may have replaced it. Request a new link.',
  expired: `This link has expired (links last ${TTL_MINUTES} minutes). Request a new one.`,
  used: 'This link was already used to set a password. Request a new one if needed.',
  'too-many-opens': `This link was already opened ${RESET_MAX_OPENS} times, the maximum. Request a new one.`,
};

export type OpenLinkResult =
  { ok: true; expiresAt: number; opensLeft: number } | { ok: false; error: string };

/** Count one opening of a reset link; the reset page calls this on load. */
export async function openResetLink(token: string): Promise<OpenLinkResult> {
  const ip = await clientIp();
  const limit = await checkRateLimit(ip, 'reset');
  if (!limit.allowed) return { ok: false, error: lockedMessage(limit.retryAfterSeconds) };

  try {
    const opened = await openResetToken(token);
    if (opened.ok) return opened;
    if (opened.problem === 'invalid') await recordFailure(ip, 'reset');
    return { ok: false, error: LINK_PROBLEM[opened.problem] };
  } catch (error) {
    console.error('[auth] reset link check failed', error);
    return { ok: false, error: 'The link could not be checked. Try again in a moment.' };
  }
}

/**
 * Use the link, then store the new hash and end every session.
 *
 * Order matters. The password policy is checked BEFORE the token is used, so a
 * typo in the new password does not spend the link. The token is marked used
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
    return { ok: false, error: LINK_PROBLEM.invalid };
  }

  const next = field(formData, 'newPassword');
  const problem = newPasswordProblem(next, field(formData, 'confirmPassword'));
  if (problem) return { ok: false, error: problem };

  let used: Awaited<ReturnType<typeof consumeResetToken>>;
  try {
    used = await consumeResetToken(token);
  } catch (error) {
    console.error('[auth] reset token check failed', error);
    return { ok: false, error: 'The reset could not be completed. Nothing was changed.' };
  }
  if (!used.ok) {
    if (used.problem === 'invalid') await recordFailure(ip, 'reset');
    return { ok: false, error: LINK_PROBLEM[used.problem] };
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

import 'server-only';
import { adminAuthStore, BLOBS_NAMESPACE } from '@/lib/blobs';

/**
 * Outgoing email — only the admin password-reset message uses it.
 *
 * Three states, decided at runtime from configuration:
 *
 * - `RESEND_API_KEY` set → sent through Resend's HTTP API. Free plan: 100/day,
 *   3,000/month. Without a verified domain the sender must be
 *   `onboarding@resend.dev`, which Resend delivers ONLY to the address the
 *   Resend account was opened with — so that account must be the recovery
 *   address.
 * - no key, and this is a staging or local build → the message is written to
 *   `<namespace>admin-auth/outbox.json` instead, so the whole flow can be
 *   tested end to end without sending anything. Never in production: the
 *   namespace check below is the guard.
 * - no key in production → `null`. The caller says that reset by email is not
 *   configured. It does not pretend a message was sent.
 *
 * The key is read on the server only; nothing here is importable from a
 * client component (`server-only`).
 */

export interface Message {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where a reply goes — the customer, for contact-form messages. */
  replyTo?: string;
  /** Outbox key on non-production builds; one per kind of message. */
  outboxKey?: string;
}

export interface Mailer {
  kind: 'resend' | 'outbox';
  send(message: Message): Promise<void>;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Mauri-Dev <onboarding@resend.dev>';

function resendMailer(apiKey: string): Mailer {
  return {
    kind: 'resend',
    async send(message) {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || DEFAULT_FROM,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        // Status and Resend's error name only — never the request, which
        // carries the key in a header.
        let name = '';
        try {
          name = ((await response.json()) as { name?: string }).name ?? '';
        } catch {
          // body was not JSON; the status is enough
        }
        throw new Error(
          `Resend refused the message: HTTP ${response.status} ${name}`.trim(),
        );
      }
    },
  };
}

const outboxMailer: Mailer = {
  kind: 'outbox',
  async send(message) {
    await adminAuthStore().set(
      message.outboxKey ?? 'outbox.json',
      JSON.stringify({ ...message, sentAt: new Date().toISOString() }),
    );
  },
};

export function mailer(): Mailer | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) return resendMailer(apiKey);
  // '' is production — see src/lib/blobs.ts.
  if (BLOBS_NAMESPACE !== '') return outboxMailer;
  return null;
}

/**
 * Where reset links go. Fixed on the server: the address a visitor types is
 * only ever compared with this, never used as a recipient.
 */
export function recoveryAddress(): string {
  return (process.env.ADMIN_RECOVERY_EMAIL || 'baymed000@gmail.com').trim().toLowerCase();
}

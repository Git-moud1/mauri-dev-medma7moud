import 'server-only';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { contactStore } from '@/lib/blobs';
import { mailer, recoveryAddress } from '@/lib/email';

/**
 * The contact form, without Netlify Forms.
 *
 * Each message is (1) written to the `contact-messages` Blob store — the
 * archive, included in `npm run backup:blobs` — and (2) emailed through Resend
 * to the owner with `Reply-To` set to the visitor, so answering is just
 * pressing Reply in Gmail.
 *
 * The visitor is told "sent" when at least one of the two worked: the message
 * then exists somewhere the owner will see it. Only when both fail does the
 * form report an error.
 */

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().trim().max(254),
  subject: z.string().trim().max(150).optional().default(''),
  message: z.string().trim().min(1).max(5000),
});

export type ContactMessage = z.infer<typeof contactSchema>;

/** Where messages go. Defaults to the same inbox as password resets. */
function inbox(): string {
  return (process.env.CONTACT_INBOX || recoveryAddress()).trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip line breaks: the subject is an email header. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** Store and email one message. Returns whether the owner will get it. */
export async function deliverContactMessage(
  message: ContactMessage,
  locale: string,
): Promise<boolean> {
  const receivedAt = new Date().toISOString();

  let stored = false;
  try {
    // Sortable by time, unique by the random suffix; never overwritten.
    const key = `${receivedAt.replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.json`;
    const result = await contactStore().set(
      key,
      JSON.stringify({ ...message, locale, receivedAt }),
      { onlyIfNew: true },
    );
    stored = result.modified && Boolean(result.etag);
  } catch (error) {
    console.error('[contact] could not store the message', error);
  }

  let emailed = false;
  const send = mailer();
  if (send) {
    const subjectLine = oneLine(
      message.subject
        ? `${message.subject} — ${message.name}`
        : `New message from ${message.name}`,
    );
    try {
      await send.send({
        to: inbox(),
        replyTo: message.email,
        subject: `[Mauri-Dev] ${subjectLine}`.slice(0, 200),
        outboxKey: 'outbox-contact.json',
        text:
          `New message from the Mauri-Dev website (${locale}).\n\n` +
          `Name: ${message.name}\nEmail: ${message.email}\n` +
          (message.subject ? `Subject: ${message.subject}\n` : '') +
          `\n${message.message}\n\n— Reply to this email to answer ${message.name} directly.`,
        html:
          `<p>New message from the Mauri-Dev website (${escapeHtml(locale)}).</p>` +
          `<p><strong>Name:</strong> ${escapeHtml(message.name)}<br>` +
          `<strong>Email:</strong> ${escapeHtml(message.email)}` +
          (message.subject
            ? `<br><strong>Subject:</strong> ${escapeHtml(message.subject)}`
            : '') +
          `</p><p style="white-space:pre-wrap">${escapeHtml(message.message)}</p>` +
          `<p style="color:#666">Reply to this email to answer ${escapeHtml(message.name)} directly.</p>`,
      });
      emailed = true;
    } catch (error) {
      console.error('[contact] could not email the message', error);
    }
  } else {
    console.error('[contact] no mailer configured: RESEND_API_KEY is not set');
  }

  return stored || emailed;
}

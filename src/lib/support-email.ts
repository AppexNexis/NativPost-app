/**
 * src/lib/support-email.ts
 *
 * Transactional emails for the Support System.
 * Uses the existing Resend setup from src/lib/email.ts
 *
 * Emails:
 * - sendTicketConfirmation     → acknowledgment to client when ticket opens
 * - sendAutoResolvedNotification → AI resolved their ticket, here's the answer
 * - sendReplyNotification      → agent replied to the ticket
 * - sendTicketClosedNotification → CSAT collection on close
 */

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');
const FROM = process.env.FROM_EMAIL || 'NativPost Support <support@nativpost.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';

// -----------------------------------------------------------
// SHARED: inline CSS email wrapper
// Keeps emails consistent without importing React Email here.
// -----------------------------------------------------------
function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:40px 20px">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
        <!-- Header -->
        <tr>
          <td style="background:#16A34A;padding:24px 32px">
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:600">NativPost Support</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f0f0f0">
            <p style="margin:0;font-size:12px;color:#6b7280">
              NativPost — AI-powered social media management<br>
              <a href="${APP_URL}/dashboard/support" style="color:#16A34A;text-decoration:none">View your support tickets</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// -----------------------------------------------------------
// Ticket confirmation — sent immediately on creation
// -----------------------------------------------------------
export async function sendTicketConfirmation(
  to: string,
  name: string,
  subject: string,
  ticketId: string,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const ticketUrl = `${APP_URL}/dashboard/support/${ticketId}`;

  const html = emailWrapper(`
    <p style="margin:0 0 16px;font-size:16px;color:#111827">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
      We've received your support request and will get back to you shortly.
    </p>
    <div style="background:#f9fafb;border:1px solid #e4e4e7;border-radius:8px;padding:16px;margin:0 0 24px">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Your request</p>
      <p style="margin:0;font-size:15px;font-weight:600;color:#111827">${subject}</p>
    </div>
    <a href="${ticketUrl}" style="display:inline-block;background:#16A34A;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">
      View your ticket
    </a>
    <p style="margin:24px 0 0;font-size:14px;color:#6b7280;line-height:1.6">
      Our team typically responds within 4 hours during business hours. 
      If your issue is urgent, please reply to this email and mention it.
    </p>
    <p style="margin:16px 0 0;font-size:14px;color:#374151">The NativPost Support Team</p>
  `);

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `[#${ticketId.slice(0, 8).toUpperCase()}] We received your request: ${subject}`,
      html,
    });
    return true;
  } catch (err) {
    console.error('[support-email] sendTicketConfirmation failed:', err);
    return false;
  }
}

// -----------------------------------------------------------
// Auto-resolved — sent when AI fully answers the ticket
// -----------------------------------------------------------
export async function sendAutoResolvedNotification(
  to: string,
  name: string,
  subject: string,
  aiReply: string,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const html = emailWrapper(`
    <p style="margin:0 0 16px;font-size:16px;color:#111827">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
      We looked into your request about <strong>${subject}</strong> and here's what we found:
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 24px">
      <p style="margin:0;font-size:15px;color:#166534;line-height:1.7;white-space:pre-wrap">${aiReply}</p>
    </div>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6">
      If this didn't fully resolve your issue, just reply to this email and a member of our team will step in.
    </p>
    <p style="margin:0;font-size:14px;color:#374151">The NativPost Support Team</p>
  `);

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Re: ${subject}`,
      html,
    });
    return true;
  } catch (err) {
    console.error('[support-email] sendAutoResolvedNotification failed:', err);
    return false;
  }
}

// -----------------------------------------------------------
// Agent reply notification
// -----------------------------------------------------------
export async function sendReplyNotification(
  to: string,
  name: string,
  subject: string,
  replyBody: string,
  ticketId: string,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const ticketUrl = `${APP_URL}/dashboard/support/${ticketId}`;

  const html = emailWrapper(`
    <p style="margin:0 0 16px;font-size:16px;color:#111827">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
      Our team has replied to your support request:
    </p>
    <div style="background:#f9fafb;border-left:3px solid #16A34A;padding:16px 20px;margin:0 0 24px;border-radius:0 8px 8px 0">
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap">${replyBody}</p>
    </div>
    <a href="${ticketUrl}" style="display:inline-block;background:#16A34A;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">
      Reply or view full thread
    </a>
    <p style="margin:24px 0 0;font-size:14px;color:#374151">The NativPost Support Team</p>
  `);

  try {
    await resend.emails.send({
      from: FROM,
      to,
      replyTo: `support+${ticketId}@nativpost.com`, // enables email threading
      subject: `Re: ${subject}`,
      html,
    });
    return true;
  } catch (err) {
    console.error('[support-email] sendReplyNotification failed:', err);
    return false;
  }
}

// -----------------------------------------------------------
// CSAT collection — sent when ticket is closed
// -----------------------------------------------------------
export async function sendTicketClosedNotification(
  to: string,
  name: string,
  subject: string,
  ticketId: string,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const baseUrl = `${APP_URL}/api/support/tickets/${ticketId}/csat?score=`;

  const stars = [1, 2, 3, 4, 5]
    .map((n) => `<a href="${baseUrl}${n}" style="font-size:28px;text-decoration:none;margin:0 4px">⭐</a>`)
    .join('');

  const html = emailWrapper(`
    <p style="margin:0 0 16px;font-size:16px;color:#111827">Hi ${name},</p>
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6">
      Your support request has been resolved. We'd love your feedback — how did we do?
    </p>
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280">${subject}</p>
    <div style="text-align:center;padding:24px 0">${stars}</div>
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center">Click a star to rate your experience</p>
    <p style="margin:24px 0 0;font-size:14px;color:#374151">Thank you for choosing NativPost.</p>
  `);

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `How did we do? — ${subject}`,
      html,
    });
    return true;
  } catch (err) {
    console.error('[support-email] sendTicketClosedNotification failed:', err);
    return false;
  }
}
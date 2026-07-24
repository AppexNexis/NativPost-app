/**
 * NativPost Email Notifications via Resend + React Email
 *
 * Uses the Resend SDK with React Email components for
 * properly rendered, on-brand transactional emails.
 *
 * Emails:
 * - sendPublishedNotification  — post went live
 * - sendScheduledNotification  — post was scheduled
 * - sendApprovalNotification   — content waiting for review
 * - sendWelcomeEmail           — new user onboarding
 */

import { render } from '@react-email/components';
import { Resend } from 'resend';

import ApprovalEmail from '@/emails/ApprovalEmail';
import PublishedEmail from '@/emails/PublishedEmail';
import ScheduledEmail from '@/emails/ScheduledEmail';
import WelcomeEmail from '@/emails/WelcomeEmail';

const resend = new Resend(process.env.RESEND_API_KEY || '');
const FROM_EMAIL = process.env.FROM_EMAIL || 'NativPost <notifications@nativpost.com>';
// const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nativpost.com';

// -----------------------------------------------------------
// Post published notification
// -----------------------------------------------------------
export async function sendManagedAccountEmail(
  to: string,
  subject: string,
  text: string,
): Promise<void> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      text,
    });
    if (error) {
      console.error('[Email] sendManagedAccountEmail failed:', error);
    }
  } catch (err) {
    console.error('[Email] sendManagedAccountEmail threw:', err);
  }
}

export async function sendPublishedNotification(
  to: string,
  brandName: string,
  platforms: string,
  caption: string,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — skipping published notification');
    return false;
  }

  try {
    const html = await render(
      PublishedEmail({ brandName, platforms, caption, appUrl: APP_URL }),
    );

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Post published on ${platforms} — ${brandName}`,
      html,
    });

    if (error) {
      console.error('[Email] sendPublishedNotification error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Email] sendPublishedNotification failed:', err);
    return false;
  }
}

// -----------------------------------------------------------
// Post scheduled notification
// -----------------------------------------------------------
export async function sendScheduledNotification(
  to: string,
  brandName: string,
  platforms: string,
  caption: string,
  scheduledFor: Date,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — skipping scheduled notification');
    return false;
  }

  try {
    const scheduledForStr = scheduledFor.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const html = await render(
      ScheduledEmail({ brandName, platforms, caption, scheduledFor: scheduledForStr, appUrl: APP_URL }),
    );

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Post scheduled for ${platforms} — ${brandName}`,
      html,
    });

    if (error) {
      console.error('[Email] sendScheduledNotification error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Email] sendScheduledNotification failed:', err);
    return false;
  }
}

// -----------------------------------------------------------
// Content approval notification
// -----------------------------------------------------------
export async function sendApprovalNotification(
  to: string,
  brandName: string,
  contentCount: number,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — skipping approval notification');
    return false;
  }

  try {
    const html = await render(
      ApprovalEmail({ brandName, contentCount, appUrl: APP_URL }),
    );

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `${contentCount} new post${contentCount > 1 ? 's' : ''} ready for your approval — ${brandName}`,
      html,
    });

    if (error) {
      console.error('[Email] sendApprovalNotification error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Email] sendApprovalNotification failed:', err);
    return false;
  }
}

// -----------------------------------------------------------
// AI credits low balance alert
// -----------------------------------------------------------
export async function sendLowBalanceAlertEmail(
  to: string,
  balanceUsd: number,
  thresholdUsd: number,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set, skipping low balance alert');
    return false;
  }

  try {
    const settingsUrl = `${APP_URL}/dashboard/settings?tab=credits`;
    const html = `
      <!doctype html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#0a0a0a; color:#f5f5f5; padding:32px;">
          <div style="max-width:520px; margin:0 auto; background:#111; border:1px solid #262626; border-radius:12px; padding:32px;">
            <h1 style="font-size:20px; margin:0 0 12px;">Your AI credits are running low</h1>
            <p style="color:#a3a3a3; line-height:1.6; margin:0 0 16px;">
              Your NativPost AI Studio balance is $${balanceUsd.toFixed(2)}, which is below your $${thresholdUsd.toFixed(2)} alert threshold.
            </p>
            <p style="color:#a3a3a3; line-height:1.6; margin:0 0 24px;">
              Top up now to keep generating without interruption.
            </p>
            <a href="${settingsUrl}" style="display:inline-block; background:#864FFE; color:#fff; text-decoration:none; padding:10px 20px; border-radius:8px; font-weight:600;">
              Top up credits
            </a>
            <p style="color:#525252; font-size:12px; margin-top:32px;">
              You can disable this alert or change the threshold in Settings, Credits.
            </p>
          </div>
        </body>
      </html>
    `;

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Your NativPost AI credits are running low',
      html,
    });

    if (error) {
      console.error('[Email] sendLowBalanceAlertEmail error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Email] sendLowBalanceAlertEmail failed:', err);
    return false;
  }
}

// -----------------------------------------------------------
// Welcome email
// -----------------------------------------------------------
export async function sendWelcomeEmail(
  to: string,
  userName: string,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — skipping welcome email');
    return false;
  }

  try {
    const html = await render(
      WelcomeEmail({ userName, appUrl: APP_URL }),
    );

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Welcome to NativPost — let\'s set up your brand',
      html,
    });

    if (error) {
      console.error('[Email] sendWelcomeEmail error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Email] sendWelcomeEmail failed:', err);
    return false;
  }
}

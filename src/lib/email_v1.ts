/**
 * NativPost Email Notifications via Resend + React Email
 *
 * Uses the Resend SDK with React Email components for
 * properly rendered, on-brand transactional emails.
 *
 * Emails:
 * - sendPublishedNotification  — post went live
 * - sendApprovalNotification   — content waiting for review
 * - sendWelcomeEmail           — new user onboarding
 */

import { render } from '@react-email/components';
import { Resend } from 'resend';

import ApprovalEmail from '@/emails/ApprovalEmail';
import PublishedEmail from '@/emails/PublishedEmail';
import WelcomeEmail from '@/emails/WelcomeEmail';

const resend = new Resend(process.env.RESEND_API_KEY || '');
const FROM_EMAIL = process.env.FROM_EMAIL || 'NativPost <notifications@nativpost.com>';
// const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nativpost.com';

// -----------------------------------------------------------
// Post published notification
// -----------------------------------------------------------
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

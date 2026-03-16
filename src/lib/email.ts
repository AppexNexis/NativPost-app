/**
 * NativPost Email Notifications via Resend
 *
 * Sends transactional emails for:
 * - Content ready for approval
 * - Content published
 * - Weekly content digest
 * - Welcome / onboarding
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'NativPost <notifications@nativpost.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({ to, subject, html }: SendEmailParams): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email');
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });

    if (!res.ok) {
      console.error('Resend error:', await res.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error('Failed to send email:', err);
    return false;
  }
}

// -----------------------------------------------------------
// EMAIL TEMPLATES
// -----------------------------------------------------------

export async function sendApprovalNotification(
  to: string,
  brandName: string,
  contentCount: number,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `${contentCount} new posts ready for your approval — ${brandName}`,
    html: `
      <div style="font-family: 'Inter Tight', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 24px;">
          <strong style="color: #16A34A; font-size: 18px;">NativPost</strong>
        </div>
        <h1 style="font-size: 22px; font-weight: 600; color: #1A1A1C; margin-bottom: 12px;">
          New content ready for review
        </h1>
        <p style="font-size: 15px; color: #6B7280; line-height: 1.6; margin-bottom: 24px;">
          We've crafted <strong style="color: #1A1A1C;">${contentCount} new post${contentCount > 1 ? 's' : ''}</strong>
          for <strong style="color: #1A1A1C;">${brandName}</strong>. They're waiting for your review in the approvals dashboard.
        </p>
        <a href="${APP_URL}/dashboard/approvals"
           style="display: inline-block; background: #16A34A; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
          Review content
        </a>
        <p style="font-size: 13px; color: #9CA3AF; margin-top: 32px; line-height: 1.5;">
          You're receiving this because you have pending approvals on NativPost.
          <a href="${APP_URL}/dashboard/settings" style="color: #6B7280;">Manage notifications</a>
        </p>
      </div>
    `,
  });
}

export async function sendPublishedNotification(
  to: string,
  brandName: string,
  platform: string,
  caption: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Post published on ${platform} — ${brandName}`,
    html: `
      <div style="font-family: 'Inter Tight', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 24px;">
          <strong style="color: #16A34A; font-size: 18px;">NativPost</strong>
        </div>
        <h1 style="font-size: 22px; font-weight: 600; color: #1A1A1C; margin-bottom: 12px;">
          Content published
        </h1>
        <p style="font-size: 15px; color: #6B7280; line-height: 1.6; margin-bottom: 16px;">
          Your post for <strong style="color: #1A1A1C;">${brandName}</strong> has been published on
          <strong style="color: #1A1A1C;">${platform}</strong>.
        </p>
        <div style="background: #F4F5F8; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <p style="font-size: 14px; color: #374151; line-height: 1.6; margin: 0;">
            ${caption.length > 200 ? caption.substring(0, 200) + '...' : caption}
          </p>
        </div>
        <a href="${APP_URL}/dashboard/analytics"
           style="display: inline-block; background: #1A1A1C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
          View analytics
        </a>
        <p style="font-size: 13px; color: #9CA3AF; margin-top: 32px;">
          <a href="${APP_URL}/dashboard/settings" style="color: #6B7280;">Manage notifications</a>
        </p>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(
  to: string,
  userName: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: 'Welcome to NativPost — let\'s set up your brand',
    html: `
      <div style="font-family: 'Inter Tight', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="margin-bottom: 24px;">
          <strong style="color: #16A34A; font-size: 18px;">NativPost</strong>
        </div>
        <h1 style="font-size: 22px; font-weight: 600; color: #1A1A1C; margin-bottom: 12px;">
          Welcome, ${userName}!
        </h1>
        <p style="font-size: 15px; color: #6B7280; line-height: 1.6; margin-bottom: 8px;">
          You're in. NativPost is your studio-crafted content engine — agency-quality social media
          content at a price your business can afford.
        </p>
        <p style="font-size: 15px; color: #6B7280; line-height: 1.6; margin-bottom: 24px;">
          Here's how to get started:
        </p>
        <ol style="font-size: 14px; color: #374151; line-height: 2; padding-left: 20px; margin-bottom: 24px;">
          <li><strong>Build your Brand Profile</strong> — takes about 10 minutes</li>
          <li><strong>Connect your social accounts</strong> — Instagram, LinkedIn, X, and more</li>
          <li><strong>Generate your first content</strong> — we'll create 3 variants for you to choose from</li>
          <li><strong>Approve and publish</strong> — your content goes live on your schedule</li>
        </ol>
        <a href="${APP_URL}/dashboard/brand-profile/onboarding"
           style="display: inline-block; background: #16A34A; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
          Start your Brand Profile
        </a>
        <p style="font-size: 13px; color: #9CA3AF; margin-top: 32px; line-height: 1.5;">
          Questions? Reply to this email or reach us at support@nativpost.com.
          <br/>A product of <a href="https://www.appexnexis.site/" style="color: #6B7280;">AppexNexis LTD</a>
        </p>
      </div>
    `,
  });
}

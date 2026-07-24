// MSI notifications (docs §14). Key lifecycle events emit an in-app
// notification to the customer's org. Pure builder + a thin insert service.

import { getOrgCustomerEmail } from '@/lib/clerk-org-helpers';
import { db } from '@/lib/db';
import { sendManagedAccountEmail } from '@/lib/email';
import { notificationSchema } from '@/models/Schema';

export type ManagedNotificationEvent = 'review_ready' | 'went_live';

export type NewNotification = {
  orgId: string;
  type: string;
  category: string;
  title: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
};

export function buildManagedAccountNotification(input: {
  orgId: string;
  event: ManagedNotificationEvent;
  accountId: string;
  handle: string;
}): NewNotification {
  const base = {
    orgId: input.orgId,
    category: 'infrastructure',
    actionUrl: `/dashboard/infrastructure/${input.accountId}`,
  };
  if (input.event === 'went_live') {
    return {
      ...base,
      type: 'success',
      title: `${input.handle} is live`,
      body: 'Your managed account is live and ready to publish.',
      actionLabel: 'View account',
    };
  }
  return {
    ...base,
    type: 'info',
    title: `${input.handle} is ready for review`,
    body: 'Review the profile and approve, or request changes before it goes live.',
    actionLabel: 'Review account',
  };
}

export function buildManagedAccountEmailContent(input: {
  event: ManagedNotificationEvent;
  handle: string;
  url: string;
}): { subject: string; text: string } {
  if (input.event === 'went_live') {
    return {
      subject: `${input.handle} is live`,
      text: `Good news — your managed account ${input.handle} is live and ready to publish.\n\nView it: ${input.url}`,
    };
  }
  return {
    subject: `${input.handle} is ready for your review`,
    text: `Your managed account ${input.handle} is ready. Review the profile and approve it, or request changes.\n\nReview it: ${input.url}`,
  };
}

export async function notifyManagedAccount(input: {
  orgId: string;
  event: ManagedNotificationEvent;
  accountId: string;
  handle: string;
}): Promise<void> {
  await db.insert(notificationSchema).values(buildManagedAccountNotification(input));

  // Best-effort email — never block the in-app notification on it.
  try {
    const to = await getOrgCustomerEmail(input.orgId);
    if (to) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const { subject, text } = buildManagedAccountEmailContent({
        event: input.event,
        handle: input.handle,
        url: `${appUrl}/dashboard/infrastructure/${input.accountId}`,
      });
      await sendManagedAccountEmail(to, subject, text);
    }
  } catch (err) {
    console.error('[MSI] email notification failed:', err);
  }
}

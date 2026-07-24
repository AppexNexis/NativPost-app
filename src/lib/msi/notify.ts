// MSI notifications (docs §14). Key lifecycle events emit an in-app
// notification to the customer's org. Pure builder + a thin insert service.

import { db } from '@/lib/db';
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

export async function notifyManagedAccount(input: {
  orgId: string;
  event: ManagedNotificationEvent;
  accountId: string;
  handle: string;
}): Promise<void> {
  await db.insert(notificationSchema).values(buildManagedAccountNotification(input));
}

/**
 * src/lib/notifications.ts
 *
 * In-app notification producer. Writes rows to the `notification` table that
 * the navbar bell (NotificationPanel) reads from /api/notifications.
 *
 * Every helper is best-effort: a failed insert is logged and swallowed so it
 * never blocks the main flow (publishing, approvals, billing, limit checks).
 *
 * Category values MUST match the panel's tabs:
 *   publish | approval | billing | system | content
 * Type values MUST match the panel's styling map:
 *   error | warning | info | success
 */

import { db } from '@/lib/db';
import { notificationSchema } from '@/models/Schema';

export type NotificationType = 'error' | 'warning' | 'info' | 'success';
export type NotificationCategory =
  | 'publish'
  | 'approval'
  | 'billing'
  | 'system'
  | 'content';

export type CreateNotificationInput = {
  orgId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Optional deep link the panel renders as a button. */
  actionUrl?: string;
  actionLabel?: string;
  /** When set, the notification is only visible to this user; otherwise org-wide. */
  userId?: string;
};

/**
 * Best-effort insert of a single in-app notification. Never throws.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  try {
    await db.insert(notificationSchema).values({
      orgId: input.orgId,
      userId: input.userId ?? null,
      type: input.type,
      category: input.category,
      title: input.title,
      body: input.body,
      actionUrl: input.actionUrl ?? null,
      actionLabel: input.actionLabel ?? null,
    });
  } catch (err) {
    console.error('[notifications] insert failed:', err);
  }
}

// -----------------------------------------------------------
// Typed convenience wrappers
// -----------------------------------------------------------

export async function notifyPublishSucceeded(
  orgId: string,
  platform: string,
  caption?: string | null,
  postId?: string | null,
): Promise<void> {
  const trimmed = (caption ?? '').trim();
  const preview = trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed;
  await createNotification({
    orgId,
    type: 'success',
    category: 'publish',
    title: `Published to ${platform}`,
    body: preview || 'Your post is now live.',
    actionUrl: postId ? `/dashboard/posts/${postId}` : undefined,
    actionLabel: postId ? 'View post' : undefined,
  });
}

export async function notifyPublishFailed(
  orgId: string,
  platform: string,
  error: string,
  postId?: string | null,
): Promise<void> {
  await createNotification({
    orgId,
    type: 'error',
    category: 'publish',
    title: `Failed to publish to ${platform}`,
    body: error || 'Something went wrong while publishing.',
    actionUrl: postId ? `/dashboard/posts/${postId}` : undefined,
    actionLabel: postId ? 'Review post' : undefined,
  });
}

export async function notifyApprovalPending(
  orgId: string,
  count: number,
): Promise<void> {
  await createNotification({
    orgId,
    type: 'info',
    category: 'approval',
    title:
      count === 1
        ? '1 post is waiting for review'
        : `${count} posts are waiting for review`,
    body: 'Approve or request changes before they can be scheduled.',
    actionUrl: '/dashboard/content?status=pending_review',
    actionLabel: 'Review now',
  });
}

export async function notifyBilling(
  orgId: string,
  title: string,
  body: string,
  type: NotificationType = 'info',
): Promise<void> {
  await createNotification({
    orgId,
    type,
    category: 'billing',
    title,
    body,
    actionUrl: '/dashboard/billing',
    actionLabel: 'Manage plan',
  });
}

export async function notifyLimitReached(
  orgId: string,
  resource: string,
  body: string,
): Promise<void> {
  await createNotification({
    orgId,
    type: 'warning',
    category: 'system',
    title: `${resource} limit reached`,
    body,
    actionUrl: '/dashboard/billing',
    actionLabel: 'Upgrade plan',
  });
}

export async function notifySystem(
  orgId: string,
  title: string,
  body: string,
  type: NotificationType = 'info',
  actionUrl?: string,
  actionLabel?: string,
): Promise<void> {
  await createNotification({
    orgId,
    type,
    category: 'system',
    title,
    body,
    actionUrl,
    actionLabel,
  });
}

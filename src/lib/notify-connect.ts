/**
 * src/lib/notify-connect.ts
 *
 * Sends proactive notifications to clients on their connected channels
 * (Telegram, Discord, WhatsApp) via the NativPost Connect notifier services.
 *
 * Drop this file into the main NativPost app at src/lib/notify-connect.ts
 * and call it from anywhere events occur (publishing queue, approvals, billing).
 *
 * Required env vars in the main app:
 *   NATIVPOST_INTERNAL_SECRET  — shared secret between app and notifiers
 *   TELEGRAM_NOTIFIER_URL      — URL of the Telegram notifier service
 *   DISCORD_NOTIFIER_URL       — URL of the Discord bot service (optional)
 */

type NotificationEvent =
  | 'post_published'
  | 'post_failed'
  | 'approval_needed'
  | 'billing_alert'
  | 'limit_warning'
  | 'weekly_digest'
  | 'custom';

type NotificationPayload = {
  orgId:   string;
  userId?: string;
  event:   NotificationEvent;
  data:    Record<string, unknown>;
};

/**
 * Send a notification to all connected channels for an org.
 * Fires to Telegram and Discord in parallel. Fails silently —
 * notifications are best-effort and should never block the main flow.
 */
export async function notifyConnect(
  orgId:   string,
  event:   NotificationEvent,
  data:    Record<string, unknown>,
  userId?: string,
): Promise<void> {
  const secret = process.env.NATIVPOST_INTERNAL_SECRET;
  if (!secret) return;

  const notifiers = [
    process.env.TELEGRAM_NOTIFIER_URL,
    process.env.DISCORD_NOTIFIER_URL,
  ].filter(Boolean) as string[];

  if (notifiers.length === 0) return;

  const payload: NotificationPayload = { orgId, event, data };
  if (userId) payload.userId = userId;

  await Promise.allSettled(
    notifiers.map((url) =>
      fetch(`${url}/notify`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify(payload),
      }).catch((err) =>
        console.warn(`[notify-connect] Failed to reach ${url}:`, err),
      ),
    ),
  );
}

// ── Typed convenience wrappers ────────────────────────────────

export async function notifyPostPublished(
  orgId:    string,
  platform: string,
  caption?: string,
  postId?:  string,
): Promise<void> {
  await notifyConnect(orgId, 'post_published', {
    platform,
    caption,
    engagementUrl: postId
      ? `https://app.nativpost.com/dashboard/posts/${postId}`
      : undefined,
  });
}

export async function notifyPostFailed(
  orgId:    string,
  platform: string,
  error:    string,
): Promise<void> {
  await notifyConnect(orgId, 'post_failed', { platform, error });
}

export async function notifyApprovalNeeded(
  orgId: string,
  count: number,
): Promise<void> {
  await notifyConnect(orgId, 'approval_needed', { count });
}

export async function notifyBillingAlert(
  orgId:   string,
  message: string,
): Promise<void> {
  await notifyConnect(orgId, 'billing_alert', { message });
}

export async function notifyLimitWarning(
  orgId:     string,
  used:      number,
  limit:     number,
  remaining: number,
): Promise<void> {
  await notifyConnect(orgId, 'limit_warning', { used, limit, remaining });
}

export async function notifyWeeklyDigest(
  orgId:      string,
  published:  number,
  engagement: number,
  reach:      number,
): Promise<void> {
  await notifyConnect(orgId, 'weekly_digest', { published, engagement, reach });
}

/**
 * Example usage in the main app:
 *
 * In the publishing queue worker (when a post publishes):
 *   import { notifyPostPublished } from '@/lib/notify-connect';
 *   await notifyPostPublished(orgId, 'instagram', post.caption, post.id);
 *
 * In the publishing queue worker (when a post fails):
 *   import { notifyPostFailed } from '@/lib/notify-connect';
 *   await notifyPostFailed(orgId, 'linkedin', 'Token expired — reconnect LinkedIn');
 *
 * In the approvals route (when new posts await review):
 *   import { notifyApprovalNeeded } from '@/lib/notify-connect';
 *   await notifyApprovalNeeded(orgId, pendingCount);
 *
 * In the billing webhook handler:
 *   import { notifyBillingAlert } from '@/lib/notify-connect';
 *   await notifyBillingAlert(orgId, 'Your subscription renews in 3 days. $49 will be charged.');
 */

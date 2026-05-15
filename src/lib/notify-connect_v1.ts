/**
 * src/lib/notify-connect.ts
 *
 * Drop this file into the main NativPost app (src/lib/).
 * Call notifyConnect() wherever events occur — post published,
 * post failed, approval needed, etc.
 *
 * It fans out to both the Telegram notifier and Discord bot
 * simultaneously. Either can be absent — missing env vars are
 * silently ignored so the main app never crashes because of Connect.
 */

type NotifyEvent =
  | 'post_published'
  | 'post_failed'
  | 'approval_needed'
  | 'billing_alert'
  | 'limit_warning'
  | 'weekly_digest'
  | 'custom';

type NotifyPayload = {
  orgId: string;
  event: NotifyEvent;
  data: Record<string, unknown>;
};

async function postToService(url: string, secret: string, payload: NotifyPayload) {
  try {
    await fetch(`${url}/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn(`[notify-connect] Failed to reach ${url}:`, e);
  }
}

/**
 * Send a proactive notification to a client across all their connected channels.
 * Fire-and-forget — never awaited in critical paths.
 *
 * @example
 * // After publishing a post:
 * notifyConnect(orgId, 'post_published', {
 *   platform: 'instagram',
 *   caption: post.caption,
 *   engagementUrl: `https://app.nativpost.com/dashboard/posts/${post.id}`,
 * });
 *
 * // After a publish failure:
 * notifyConnect(orgId, 'post_failed', {
 *   platform: queue.platform,
 *   error: queue.errorMessage,
 * });
 *
 * // When approval queue grows:
 * notifyConnect(orgId, 'approval_needed', { count: pendingCount });
 *
 * // Post limit approaching:
 * notifyConnect(orgId, 'limit_warning', {
 *   used: postsUsed,
 *   limit: postsPerMonth,
 *   remaining: postsRemaining,
 * });
 *
 * // Billing event:
 * notifyConnect(orgId, 'billing_alert', {
 *   message: 'Your plan renews in 3 days. $49 will be charged.',
 * });
 */
export function notifyConnect(
  orgId: string,
  event: NotifyEvent,
  data: Record<string, unknown> = {},
): void {
  const secret = process.env.NATIVPOST_INTERNAL_SECRET;
  if (!secret) return;

  const payload: NotifyPayload = { orgId, event, data };

  const telegramUrl = process.env.TELEGRAM_NOTIFIER_URL;
  const discordUrl  = process.env.DISCORD_BOT_URL;

  if (telegramUrl) postToService(telegramUrl, secret, payload);
  if (discordUrl)  postToService(discordUrl,  secret, payload);
}
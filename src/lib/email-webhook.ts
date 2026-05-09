// lib/email-webhook.ts
// Fires lifecycle events to the NativPost Email Marketing Tool
// Add NATIVPOST_EMAIL_WEBHOOK_SECRET to your .env.local

export async function fireEmailEvent(
  event: string,
  data: Record<string, string | number | boolean | null | undefined>,
): Promise<void> {
  const secret = process.env.NATIVPOST_EMAIL_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[EmailWebhook] NATIVPOST_EMAIL_WEBHOOK_SECRET not set — skipping');
    return;
  }

  try {
    await fetch('https://email.nativpost.com/webhook/app', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'x-nativpost-secret': secret,
      }),
      body: JSON.stringify({ event, data }),
    });
  } catch (e) {
    // Non-fatal — email tool being down should never break the app
    console.error('[EmailWebhook] Failed to fire event:', event, e);
  }
}
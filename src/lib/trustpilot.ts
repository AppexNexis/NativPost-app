/**
 * NativPost — Trustpilot AFS Integration
 *
 * src/lib/trustpilot.ts
 *
 * Sends a review invitation to a customer via Trustpilot's Invitations API
 * 7 days after they convert from trial to a paid plan.
 *
 * SETUP — add these to your Vercel environment variables:
 *   TRUSTPILOT_API_KEY          — from Trustpilot Business → Integrations → API
 *   TRUSTPILOT_API_SECRET       — same location
 *   TRUSTPILOT_BUSINESS_UNIT_ID — from your Trustpilot Business URL or API
 *   TRUSTPILOT_TEMPLATE_ID      — fetch with getTemplates() below, then hardcode
 *
 * FLOW:
 *   1. User converts to paid (Stripe/Paystack webhook fires)
 *   2. sendTrustpilotInvitation() is called with a 7-day delay
 *   3. Trustpilot sends the review email at the scheduled time
 */

const TRUSTPILOT_API_KEY        = process.env.TRUSTPILOT_API_KEY || '';
const TRUSTPILOT_API_SECRET     = process.env.TRUSTPILOT_API_SECRET || '';
const TRUSTPILOT_BUSINESS_UNIT  = process.env.TRUSTPILOT_BUSINESS_UNIT_ID || '';
const TRUSTPILOT_TEMPLATE_ID    = process.env.TRUSTPILOT_TEMPLATE_ID || '';

const TP_AUTH_URL  = 'https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken';
const TP_INVITE_URL = `https://invitations-api.trustpilot.com/v1/private/business-units/${TRUSTPILOT_BUSINESS_UNIT}/email-invitations`;
const TP_TEMPLATES_URL = `https://invitations-api.trustpilot.com/v1/private/business-units/${TRUSTPILOT_BUSINESS_UNIT}/templates`;

// -----------------------------------------------------------
// Auth — get an access token using client_credentials grant
// Tokens expire in 1 hour. For production, cache this token
// and only refresh when expired.
// -----------------------------------------------------------
async function getTrustpilotToken(): Promise<string> {
  const credentials = Buffer.from(`${TRUSTPILOT_API_KEY}:${TRUSTPILOT_API_SECRET}`).toString('base64');

  const res = await fetch(TP_AUTH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Trustpilot auth failed (${res.status}): ${err}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// -----------------------------------------------------------
// Get template ID — run this once to find your template ID,
// then hardcode it in TRUSTPILOT_TEMPLATE_ID env var.
// -----------------------------------------------------------
export async function getTrustpilotTemplates(): Promise<{ id: string; name: string; locale: string }[]> {
  const token = await getTrustpilotToken();

  const res = await fetch(TP_TEMPLATES_URL, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Trustpilot templates failed (${res.status})`);

  const data = await res.json() as {
    templates: { id: string; name: string; locale: string }[]
  };
  return data.templates;
}

// -----------------------------------------------------------
// Send a review invitation
// -----------------------------------------------------------
export interface TrustpilotInviteParams {
  customerEmail: string;
  customerName: string;
  orgId: string;        // used as the referenceNumber (your internal ID)
  orgName?: string;     // shown in the email subject/body via template
  plan?: string;        // used as a tag for filtering in Trustpilot dashboard
}

export async function sendTrustpilotInvitation(params: TrustpilotInviteParams): Promise<void> {
  if (!TRUSTPILOT_API_KEY || !TRUSTPILOT_BUSINESS_UNIT || !TRUSTPILOT_TEMPLATE_ID) {
    console.warn('[Trustpilot] Missing env vars — skipping invitation');
    return;
  }

  try {
    const token = await getTrustpilotToken();

    // Send the invitation with a 7-day delay from now
    const sendAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const body = {
      replyTo:       'support@nativpost.com',
      locale:        'en-US',
      senderName:    'NativPost',
      senderEmail:   'support@nativpost.com',
      referenceNumber: params.orgId,
      consumerName:  params.customerName,
      consumerEmail: params.customerEmail,
      type:          'email',
      serviceReviewInvitation: {
        templateId:        TRUSTPILOT_TEMPLATE_ID,
        preferredSendTime: sendAt,
        redirectUri:       'https://nativpost.com',
        tags: [
          params.plan || 'paid',
          'afs',
        ].filter(Boolean),
      },
    };

    const res = await fetch(TP_INVITE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Trustpilot] Invitation failed (${res.status}):`, err);
      return;
    }

    console.log(`[Trustpilot] Invitation queued for ${params.customerEmail} — sends at ${sendAt}`);
  } catch (err) {
    // Never throw — a failed review invitation must never block billing flows
    console.error('[Trustpilot] Invitation error (non-fatal):', err);
  }
}
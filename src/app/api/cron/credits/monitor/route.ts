import { eq, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  addAiCredits,
  type AiCreditWallet,
  updateLowBalanceAlertConfig,
  walletBalanceUsd,
} from '@/lib/ai-studio/server';
import { chargePaystackAuthorization } from '@/lib/billing/paystack-charge';
import { sendLowBalanceAlertEmail } from '@/lib/email';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CREDITS_PER_DOLLAR = 10;
const ALERT_COOLDOWN_HOURS = 24;

/**
 * GET /api/cron/credits/monitor
 *
 * Iterates orgs that have opted into auto top-up or the low balance alert.
 * For each org:
 *   - If auto top-up is enabled and balance < threshold and a Paystack
 *     authorization is on file, charge it and credit the wallet.
 *   - If the low balance alert is enabled and balance < threshold and the
 *     last notification is older than the cooldown, email the org.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = await getDb();

  // Filter down at the DB layer: only rows whose aiCredits blob has at least
  // one feature enabled. jsonb path lookup keeps the scan cheap.
  const rows = await db
    .select()
    .from(organizationSchema)
    .where(
      sql`(
        (${organizationSchema.settings} -> 'aiCredits' -> 'autoTopUp' ->> 'enabled') = 'true'
        OR (${organizationSchema.settings} -> 'aiCredits' -> 'lowBalanceAlert' ->> 'enabled') = 'true'
      )`,
    );

  const topUps: Array<{ orgId: string; amountUsd: number; ok: boolean; message?: string }> = [];
  const alerts: Array<{ orgId: string; sent: boolean }> = [];

  for (const org of rows) {
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    const wallet = (settings.aiCredits ?? null) as AiCreditWallet | null;
    if (!wallet) continue;

    const balanceUsd = walletBalanceUsd(wallet);

    // Auto top-up path.
    if (
      wallet.autoTopUp?.enabled
      && balanceUsd < wallet.autoTopUp.threshold
      && org.paystackAuthorizationCode
      && org.paystackCustomerEmail
    ) {
      const amountUsd = wallet.autoTopUp.amountUsd;
      const charge = await chargePaystackAuthorization({
        email: org.paystackCustomerEmail,
        authorizationCode: org.paystackAuthorizationCode,
        amountUsd,
        metadata: {
          orgId: org.id,
          type: 'ai_credits_auto_topup',
          credits: Math.round(amountUsd * CREDITS_PER_DOLLAR),
        },
      });

      if (charge.ok) {
        await addAiCredits(org.id, Math.round(amountUsd * CREDITS_PER_DOLLAR), {
          type: 'purchase',
          description: `Auto top-up ($${amountUsd.toFixed(2)})`,
        });
        topUps.push({ orgId: org.id, amountUsd, ok: true });
      } else {
        topUps.push({ orgId: org.id, amountUsd, ok: false, message: charge.message });
      }
    }

    // Low-balance email path.
    if (
      wallet.lowBalanceAlert?.enabled
      && balanceUsd < wallet.lowBalanceAlert.threshold
    ) {
      const lastNotified = wallet.lowBalanceAlert.lastNotifiedAt
        ? new Date(wallet.lowBalanceAlert.lastNotifiedAt).getTime()
        : 0;
      const now = Date.now();
      const cooldownMs = ALERT_COOLDOWN_HOURS * 60 * 60 * 1000;

      if (now - lastNotified >= cooldownMs && org.paystackCustomerEmail) {
        const sent = await sendLowBalanceAlertEmail(
          org.paystackCustomerEmail,
          balanceUsd,
          wallet.lowBalanceAlert.threshold,
        );
        if (sent) {
          await updateLowBalanceAlertConfig(org.id, {
            lastNotifiedAt: new Date(now).toISOString(),
          });
        }
        alerts.push({ orgId: org.id, sent });
      }
    }

    // Refresh updatedAt so we can watch the scan progress.
    await db
      .update(organizationSchema)
      .set({ updatedAt: new Date() })
      .where(eq(organizationSchema.id, org.id));
  }

  return NextResponse.json({
    scanned: rows.length,
    topUps,
    alerts,
    at: new Date().toISOString(),
  });
}

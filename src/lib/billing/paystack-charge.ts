/**
 * Shared helper for off-session Paystack charges.
 *
 * Used by:
 * - /api/credits/purchase (user-initiated top-up)
 * - /api/cron/credits/monitor (auto top-up cron)
 * - /api/cron/paystack-activate (trial activation charge)
 *
 * Charges a stored authorization code without any user interaction.
 * The authorization + customer email are captured at signup via the
 * Paystack setup fee flow and stored on the organization row.
 */

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

export interface PaystackChargeInput {
  email: string;
  authorizationCode: string;
  /** Amount to charge, in US dollars. Converted to kobo for Paystack. */
  amountUsd: number;
  metadata?: Record<string, unknown>;
}

export interface PaystackChargeResult {
  ok: boolean;
  reference: string | null;
  message: string;
  gatewayResponse?: string;
}

/**
 * Charge a saved Paystack authorization off-session.
 *
 * NGN plan flow uses kobo amounts, but AI credit top-ups are billed in USD.
 * Paystack accepts USD when the transaction currency is set. To keep parity
 * with the existing trial-activation logic (which sends kobo), we convert
 * dollars to the smallest unit (cents) and rely on Paystack's currency
 * conversion for the account's default currency setting.
 */
export async function chargePaystackAuthorization(
  input: PaystackChargeInput,
): Promise<PaystackChargeResult> {
  if (!PAYSTACK_SECRET) {
    return { ok: false, reference: null, message: 'Paystack is not configured.' };
  }

  const amountMinor = Math.round(input.amountUsd * 100);

  try {
    const res = await fetch('https://api.paystack.co/transaction/charge_authorization', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.email,
        amount: amountMinor,
        authorization_code: input.authorizationCode,
        metadata: JSON.stringify(input.metadata ?? {}),
      }),
    });

    const data: any = await res.json();
    const status = data?.data?.status;
    const gatewayResponse = data?.data?.gateway_response;
    const reference = data?.data?.reference ?? null;

    if (!data?.status || status !== 'success') {
      return {
        ok: false,
        reference,
        message: gatewayResponse || data?.message || 'Charge failed',
        gatewayResponse,
      };
    }

    return {
      ok: true,
      reference,
      message: 'Charge succeeded',
      gatewayResponse,
    };
  } catch (err: any) {
    return {
      ok: false,
      reference: null,
      message: err?.message || 'Network error contacting Paystack',
    };
  }
}

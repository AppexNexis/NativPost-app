/**
 * POST /api/ai-studio/copilot
 *
 * In-app assistant for AI Studio. Two modes:
 *   prompt  — turns a rough idea into a generation-ready prompt, with a
 *             validated model id + aspect ratio the client can apply directly.
 *   support — answers NativPost product questions.
 *
 * Metered against the AI Studio credit wallet. Chat is a real token cost, and
 * an unmetered assistant on the free tier is an unbounded bill.
 *
 * Body: { mode?: 'prompt' | 'support', messages: [{ role, content }] }
 */

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { CopilotMessage, CopilotMode } from '@/lib/ai-studio/copilot';
import { runCopilot } from '@/lib/ai-studio/copilot';
import { getAiCreditsWallet, spendAiCredits } from '@/lib/ai-studio/server';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

/**
 * Credits per copilot turn, by mode.
 *
 * Support is FREE. Charging someone credits to ask "why isn't my post
 * publishing" is charging them to report a problem — it suppresses exactly the
 * questions you most want asked, and a free-tier user hitting a wall would be
 * billed for finding out why.
 *
 * Prompt help costs 1: it's discretionary, it feeds a paid generation, and it
 * stays well under the cheapest model (3) so it never discourages the thing
 * it exists to improve.
 */
const CREDIT_COST_BY_MODE: Record<CopilotMode, number> = {
  support: 0,
  prompt: 1,
};

const MAX_MESSAGE_CHARS = 2000;
const MAX_MESSAGES = 20;

export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mode: CopilotMode = body.mode === 'support' ? 'support' : 'prompt';

  // Validate the transcript rather than trusting it — it goes straight into a
  // model prompt, and an unbounded array is both a cost and an abuse vector.
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages: CopilotMessage[] = rawMessages
    .slice(-MAX_MESSAGES)
    .filter((m): m is { role: string; content: string } =>
      !!m && typeof m === 'object'
      && typeof (m as any).content === 'string'
      && ((m as any).role === 'user' || (m as any).role === 'assistant'))
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content.slice(0, MAX_MESSAGE_CHARS),
    }));

  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    return NextResponse.json(
      { error: 'messages must end with a user message' },
      { status: 400 },
    );
  }

  const creditCost = CREDIT_COST_BY_MODE[mode];

  // Balance is checked BEFORE spending tokens — charging afterwards would let
  // a zero-balance org run the model for free on every retry. Skipped entirely
  // for free modes, so a user with no credits can still reach support.
  if (creditCost > 0) {
    const wallet = await getAiCreditsWallet(orgId!);
    // Mirrors the private `totalAvailable` in lib/ai-studio/server: monthly
    // allowance not yet used, plus purchased add-on credits.
    const available
      = Math.max(0, wallet.monthly.limit - wallet.monthly.used) + wallet.addon.remaining;
    if (available < creditCost) {
      return NextResponse.json(
        {
          error: 'You are out of AI credits. Top up or upgrade to keep using prompt help.',
          upgradeRequired: true,
        },
        { status: 402 },
      );
    }
  }

  // Brand context makes prompt suggestions sound like the user's brand rather
  // than generic stock copy. Best-effort: a missing profile must not block.
  let brandContext: string | null = null;
  if (mode === 'prompt') {
    try {
      const db = await getDb();
      const [profile] = await db
        .select()
        .from(brandProfileSchema)
        .where(eq(brandProfileSchema.orgId, orgId!))
        .limit(1);
      if (profile) {
        brandContext = [
          profile.brandName ? `Name: ${profile.brandName}` : '',
          profile.industry ? `Industry: ${profile.industry}` : '',
          profile.communicationStyle ? `Style: ${profile.communicationStyle}` : '',
        ].filter(Boolean).join('\n') || null;
      }
    } catch (err) {
      console.warn('[Copilot] brand profile lookup failed:', (err as Error)?.message);
    }
  }

  const reply = await runCopilot({ mode, messages, brandContext });

  // Only charge for a real answer, and only for paid modes. Both providers
  // failing is our outage, not the user's spend.
  if (creditCost > 0 && reply.provider !== 'none') {
    try {
      await spendAiCredits(orgId!, creditCost, {
        type: 'credit_consumption',
        description: 'AI Studio copilot — prompt help',
      });
    } catch (err) {
      // Never fail a delivered answer over bookkeeping.
      console.warn('[Copilot] credit spend failed:', (err as Error)?.message);
    }
  }

  return NextResponse.json(
    {
      message: reply.message,
      suggestion: reply.suggestion,
      creditsCharged: reply.provider === 'none' ? 0 : creditCost,
    },
    { status: reply.provider === 'none' ? 503 : 200 },
  );
}

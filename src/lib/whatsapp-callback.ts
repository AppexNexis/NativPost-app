/**
 * WhatsApp OAuth callback handler.
 *
 * After the standard Meta OAuth code exchange (handled by the existing
 * /api/social-accounts/callback route), call this handler specifically
 * for WhatsApp to:
 *  1. Resolve the WABA ID, phone number ID, and channel ID
 *  2. Store the phone number ID in platformSpecific so the publisher can use it
 *
 * Usage: import and call resolveAndSaveWhatsAppAccount() from within
 * your existing OAuth callback handler, after exchangeCodeForTokens(),
 * when platform === 'whatsapp'.
 *
 * Example integration into your existing callback:
 *
 *   if (platform === 'whatsapp') {
 *     const saved = await resolveAndSaveWhatsAppAccount(orgId, accessToken, refreshToken);
 *     if (!saved) {
 *       return redirect('/connections?error=whatsapp_resolve_failed');
 *     }
 *     return redirect('/connections?success=whatsapp');
 *   }
 */

import { eq } from 'drizzle-orm';

import { getDb } from '@/libs/DB';
import { socialAccountSchema } from '@/models/Schema';
import { resolveWhatsAppAccount } from './oauth-config';

export async function resolveAndSaveWhatsAppAccount(
  orgId: string,
  accessToken: string,
  refreshToken?: string,
): Promise<boolean> {
  try {
    const details = await resolveWhatsAppAccount(accessToken);

    if (!details) {
      console.error('[WhatsApp callback] Could not resolve WABA details');
      return false;
    }

    const {
      phoneNumberId,
      phoneNumber,
      channelId,
      displayName,
      wabaId,
    } = details;

    console.log('[WhatsApp callback] Resolved:', { wabaId, phoneNumberId, phoneNumber, channelId, displayName });

    // platformUserId = channelId (where posts go) or phoneNumberId as fallback
    const platformUserId = channelId || phoneNumberId;

    const db = await getDb();

    // Upsert: deactivate any existing WhatsApp account for this org, then insert fresh
    await db
      .update(socialAccountSchema)
      .set({ isActive: false })
      .where(eq(socialAccountSchema.orgId, orgId));
    // Note: only deactivate whatsapp, not all platforms. Adjust if your schema
    // supports a WHERE orgId + platform compound filter:
    // .where(and(eq(socialAccountSchema.orgId, orgId), eq(socialAccountSchema.platform, 'whatsapp')));

    await db.insert(socialAccountSchema).values({
      orgId,
      platform: 'whatsapp',
      platformUserId,
      platformUsername: phoneNumber,           // shown in the UI as the connected number
      accessToken,
      refreshToken: refreshToken || null,
      accountType: 'business',
      profileImageUrl: null,
      isActive: true,
      // Store phoneNumberId and wabaId so the publisher can access them
      // You may need to add a `platformSpecific` JSONB column to your schema,
      // or store phoneNumberId in a dedicated column if your schema supports it.
      // For now we encode it into platformUserId as "channelId|phoneNumberId"
      // so the dispatcher can split it:
      //   const [channelId, phoneNumberId] = platformUserId.split('|');
      // ─── OR ───
      // If your schema has a `metadata` / `platformSpecific` JSON column:
      //   platformSpecific: JSON.stringify({ phoneNumberId, wabaId }),
    });

    console.log(`[WhatsApp callback] Account saved for org ${orgId}: ${phoneNumber}`);
    return true;
  } catch (err) {
    console.error('[WhatsApp callback] resolveAndSaveWhatsAppAccount error:', err);
    return false;
  }
}

/**
 * Helper: extract phoneNumberId from the stored platformUserId.
 *
 * The dispatcher passes platformUserId to publishToWhatsApp as channelId,
 * and phoneNumberId via platformSpecific.whatsapp.phoneNumberId.
 *
 * If you stored them encoded as "channelId|phoneNumberId":
 */
export function parseWhatsAppPlatformUserId(platformUserId: string): {
  channelId: string;
  phoneNumberId: string;
} {
  const parts = platformUserId.split('|');
  if (parts.length === 2) {
    return { channelId: parts[0]!, phoneNumberId: parts[1]! };
  }
  // Fallback: same value used for both (phone number ID doubles as recipient)
  return { channelId: platformUserId, phoneNumberId: platformUserId };
}
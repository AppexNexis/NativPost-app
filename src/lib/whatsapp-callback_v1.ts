/**
 * WhatsApp OAuth callback handler.
 *
 * Call resolveAndSaveWhatsAppAccount() from within your existing
 * OAuth callback route after exchangeCodeForTokens(), when platform === 'whatsapp'.
 *
 * Integration example in your existing callback handler:
 *
 *   if (platform === 'whatsapp') {
 *     const saved = await resolveAndSaveWhatsAppAccount(orgId, accessToken, refreshToken);
 *     if (!saved) {
 *       return redirect(`${BASE_URL}/connections?error=whatsapp_resolve_failed`);
 *     }
 *     return redirect(`${BASE_URL}/connections?success=whatsapp`);
 *   }
 */

import { and, eq } from 'drizzle-orm';

import { getDb } from '@/libs/DB';
import { socialAccountSchema } from '@/models/Schema';
import { resolveWhatsAppAccount } from './oauth-config';

export type WhatsAppAccountMetadata = {
  phoneNumberId: string;
  wabaId: string;
};

/**
 * After Meta OAuth completes for WhatsApp:
 *  1. Calls the Graph API to resolve the WABA, phone number ID, and channel ID
 *  2. Deactivates any existing WhatsApp account for this org
 *  3. Inserts a fresh record with metadata.phoneNumberId stored in the JSONB column
 *
 * Returns true on success, false on failure.
 */
export async function resolveAndSaveWhatsAppAccount(
  orgId: string,
  accessToken: string,
  refreshToken?: string,
): Promise<boolean> {
  try {
    const details = await resolveWhatsAppAccount(accessToken);

    if (!details) {
      console.error('[WhatsApp callback] Could not resolve WABA details — check token scopes');
      return false;
    }

    const { phoneNumberId, phoneNumber, channelId, displayName, wabaId } = details;

    console.log('[WhatsApp callback] Resolved account:', {
      wabaId,
      phoneNumberId,
      phoneNumber,
      channelId: channelId || '(none — no channel yet)',
      displayName,
    });

    const db = await getDb();

    // Deactivate any existing WhatsApp connection for this org
    await db
      .update(socialAccountSchema)
      .set({ isActive: false })
      .where(
        and(
          eq(socialAccountSchema.orgId, orgId),
          eq(socialAccountSchema.platform, 'whatsapp'),
        ),
      );

    // platformUserId = channelId if the business has a WhatsApp Channel,
    // otherwise fall back to phoneNumberId (direct messaging mode)
    const platformUserId = channelId || phoneNumberId;

    const metadata: WhatsAppAccountMetadata = {
      phoneNumberId,
      wabaId,
    };

    await db.insert(socialAccountSchema).values({
      orgId,
      platform: 'whatsapp',
      platformUserId,
      platformUsername: displayName || phoneNumber,
      accessToken,
      refreshToken: refreshToken || null,
      accountType: 'business',
      profileImageUrl: null,
      isActive: true,
      metadata,
    });

    console.log(`[WhatsApp callback] Saved for org ${orgId}: ${phoneNumber} (phoneNumberId: ${phoneNumberId})`);
    return true;
  } catch (err) {
    console.error('[WhatsApp callback] resolveAndSaveWhatsAppAccount error:', err);
    return false;
  }
}
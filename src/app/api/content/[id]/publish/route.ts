import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { publishToplatform } from '@/lib/social-publish';
import { db } from '@/libs/DB';
import { contentItemSchema, publishingQueueSchema, socialAccountSchema } from '@/models/Schema';
// import { sendPublishedNotification } from '@/lib/email';

type RouteParams = {
  params: Promise<{ id: string }>;
};

// -----------------------------------------------------------
// POST /api/content/[id]/publish
// Publishes an approved content item to all target platforms
// -----------------------------------------------------------
// export async function POST(request: NextRequest, { params }: RouteParams) {
export async function POST(request: NextRequest, { params }: RouteParams) {
  // eslint-disable-next-line no-console
  console.log({ request });
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    // 1. Fetch the content item
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, orgId!)))
      .limit(1);

    if (!item) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    if (item.status !== 'approved' && item.status !== 'scheduled') {
      return NextResponse.json(
        { error: `Cannot publish content with status "${item.status}". Must be approved or scheduled.` },
        { status: 400 },
      );
    }

    // 2. Get connected social accounts for target platforms
    const platforms = (item.targetPlatforms as string[]) || [];
    if (platforms.length === 0) {
      return NextResponse.json({ error: 'No target platforms specified' }, { status: 400 });
    }

    const accounts = await db
      .select()
      .from(socialAccountSchema)
      .where(and(eq(socialAccountSchema.orgId, orgId!), eq(socialAccountSchema.isActive, true)));

    const results: Array<{
      platform: string;
      success: boolean;
      platformPostId?: string;
      error?: string;
    }> = [];

    // 3. Publish to each platform
    for (const platform of platforms) {
      const account = accounts.find(a => a.platform === platform);

      if (!account) {
        results.push({ platform, success: false, error: `No connected ${platform} account` });
        continue;
      }

      if (!account.accessToken) {
        results.push({ platform, success: false, error: `${platform} access token missing` });
        continue;
      }

      // Get platform-specific caption or fall back to main caption
      const platformCaptions = (item.platformSpecific as Record<string, string>) || {};
      const caption = platformCaptions[platform] || item.caption;

      // Get image URL (first graphic)
      const graphicUrls = (item.graphicUrls as string[]) || [];
      const imageUrl = graphicUrls[0] || undefined;

      // Publish
      // In your publish route, replace the publishToplatform call with this:

      const result = await publishToplatform(
        platform,
        account.accessToken,
        account.platformUserId || '',
        caption,
        imageUrl,
        // Pass refresh token and a save handler for Twitter
        account.refreshToken || undefined,
        async (newAccessToken: string, newRefreshToken: string) => {
          await db
            .update(socialAccountSchema)
            .set({
              accessToken: newAccessToken,
              refreshToken: newRefreshToken,
              tokenExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
            })
            .where(eq(socialAccountSchema.id, account.id));
        },
      );
      // const result = await publishToplatform(
      //   platform,
      //   account.accessToken,
      //   account.platformUserId || '',
      //   caption,
      //   imageUrl,
      // );

      results.push({ platform, ...result });

      // 4. Record in publishing queue
      await db.insert(publishingQueueSchema).values({
        contentItemId: item.id,
        socialAccountId: account.id,
        platform,
        scheduledFor: new Date(),
        status: result.success ? 'published' : 'failed',
        platformPostId: result.platformPostId || null,
        errorMessage: result.error || null,
        publishedAt: result.success ? new Date() : null,
      });
    }

    // 5. Update content item status
    const allSucceeded = results.every(r => r.success);
    const someSucceeded = results.some(r => r.success);

    await db
      .update(contentItemSchema)
      .set({
        status: allSucceeded ? 'published' : someSucceeded ? 'published' : 'approved',
        publishedAt: someSucceeded ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    // 6. Send email notification (non-blocking)
    if (someSucceeded) {
      const successPlatforms = results.filter(r => r.success).map(r => r.platform).join(', ');
      // TODO: Get user email from Clerk
      // sendPublishedNotification(userEmail, brandName, successPlatforms, item.caption);
      // eslint-disable-next-line no-console
      console.log({ successPlatforms, caption: item.caption });
    }

    return NextResponse.json({
      published: someSucceeded,
      results,
    });
  } catch (err) {
    console.error('Publish failed:', err);
    return NextResponse.json({ error: 'Publishing failed' }, { status: 500 });
  }
}

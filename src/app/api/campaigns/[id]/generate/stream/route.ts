import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';
import { generateCampaignPosts } from '../../../utils';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// GET /api/campaigns/[id]/generate/stream
// SSE streaming endpoint for campaign generation.
// Streams progress, completion, and error events for each post.
// -----------------------------------------------------------
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', detail: 'Unauthorized' })}

`),
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  const db = await getDb();
  const { id } = await params;

  // Optional overrides from query params
  const { searchParams } = new URL(request.url);
  const topicOverride = searchParams.get('topic') || undefined;
  const targetPlatformsOverride = searchParams.get('targetPlatforms')
    ? searchParams.get('targetPlatforms')!.split(',')
    : undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}

`));
      };

      try {
        // 1. Fetch campaign
        const [campaign] = await db
          .select()
          .from(campaignSchema)
          .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId!)))
          .limit(1);

        if (!campaign) {
          send({ type: 'error', detail: 'Campaign not found' });
          controller.close();
          return;
        }

        if (campaign.status === 'generating') {
          send({ type: 'error', detail: 'Campaign is already generating' });
          controller.close();
          return;
        }

        // 2. Update status to generating
        await db.update(campaignSchema)
          .set({ status: 'generating', updatedAt: new Date() })
          .where(eq(campaignSchema.id, id));

        send({ type: 'progress', postIndex: 0, total: (campaign.postsPerDay || 3) * (campaign.campaignLengthDays || 7), status: 'starting', percent: 0 });

        // 3. Generate with streaming callbacks
        const result = await generateCampaignPosts(
          db,
          orgId!,
          campaign,
          topicOverride,
          targetPlatformsOverride,
          async (progress) => {
            send({
              type: 'progress',
              postIndex: progress.postIndex,
              total: progress.total,
              status: progress.status,
              percent: progress.percent,
            });
          },
          async (event) => {
            send({
              type: 'post_complete',
              postIndex: event.postIndex,
              contentItemId: event.contentItemId,
              contentType: event.contentType,
              scheduledDate: event.scheduledDate,
            });
          },
          async (event) => {
            send({
              type: 'error',
              postIndex: event.postIndex,
              detail: event.detail,
            });
          },
        );

        // 4. Update campaign status
        const finalStatus = result.failedPosts === result.totalPosts ? 'draft' : 'review';
        await db.update(campaignSchema)
          .set({
            status: finalStatus,
            totalPosts: result.totalPosts,
            generatedPosts: result.completedPosts,
            updatedAt: new Date(),
          })
          .where(eq(campaignSchema.id, id));

        send({
          type: 'done',
          campaignId: id,
          totalPosts: result.totalPosts,
          completedPosts: result.completedPosts,
          failedPosts: result.failedPosts,
          status: finalStatus,
        });
      } catch (err: any) {
        console.error('[Campaign Stream] Fatal error:', err);
        send({ type: 'error', detail: err.message || 'An unexpected error occurred' });

        // Best-effort reset
        try {
          await db.update(campaignSchema)
            .set({ status: 'draft', updatedAt: new Date() })
            .where(eq(campaignSchema.id, id));
        } catch { /* ignore */ }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

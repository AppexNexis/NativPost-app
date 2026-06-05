import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { socialAccountSchema } from '@/models/Schema';

export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { publishId } = await request.json() as { publishId: string };
  if (!publishId) return NextResponse.json({ error: 'publishId required' }, { status: 400 });

  const [account] = await db
    .select()
    .from(socialAccountSchema)
    .where(and(
      eq(socialAccountSchema.orgId, orgId!),
      eq(socialAccountSchema.platform, 'tiktok'),
      eq(socialAccountSchema.isActive, true),
    ))
    .limit(1);

  if (!account?.accessToken) {
    return NextResponse.json({ error: 'No TikTok account connected' }, { status: 404 });
  }

  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });

  const data = await res.json() as {
    data?: { status?: string; fail_reason?: string; publicaly_available_post_id?: string[] };
    error?: { code?: string; message?: string };
  };

  return NextResponse.json({
    status: data.data?.status || 'PROCESSING_UPLOAD',
    failReason: data.data?.fail_reason,
    postIds: data.data?.publicaly_available_post_id,
  });
}
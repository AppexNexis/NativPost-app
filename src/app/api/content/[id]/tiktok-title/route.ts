/**
 * POST /api/content/[id]/tiktok-title
 *
 * Generates a punchy TikTok title from the post caption.
 * TikTok titles must be under 100 chars, hook-first, no hashtags.
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentItemSchema } from '@/models/Schema';

const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  const [item] = await db
    .select({ caption: contentItemSchema.caption, topic: contentItemSchema.topic })
    .from(contentItemSchema)
    .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, orgId!)))
    .limit(1);

  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    // Call the engine's Claude endpoint to generate a TikTok title
    const res = await fetch(`${ENGINE_URL}/api/generate-tiktok-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: item.caption, topic: item.topic }),
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      const data = await res.json() as { title?: string };
      if (data.title) {
        return NextResponse.json({ title: data.title.slice(0, 100) });
      }
    }
  } catch {
    // Fall through to client-side generation
  }

  // Fallback: generate directly via Anthropic API
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 60,
          messages: [{
            role: 'user',
            content: `Write a punchy TikTok video title for this post. Rules:
- Maximum 100 characters
- Hook-first (start with the most interesting/controversial part)
- No hashtags
- No emojis
- Sounds natural on TikTok, not corporate
- Return ONLY the title, nothing else

Post topic: ${item.topic || 'N/A'}
Post caption: ${item.caption.slice(0, 500)}`,
          }],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const data = await res.json() as { content: Array<{ type: string; text: string }> };
        const title = data.content.find(b => b.type === 'text')?.text?.trim();
        if (title) {
          return NextResponse.json({ title: title.slice(0, 100) });
        }
      }
    } catch { /* fall through */ }
  }

  // Last resort: clean first sentence of caption
  const firstSentence = item.caption
    .split(/[.\n]/)[0]
    ?.replace(/#\w+/g, '')
    .trim()
    .slice(0, 100) || item.caption.slice(0, 100);

  return NextResponse.json({ title: firstSentence });
}
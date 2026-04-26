import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/content/[id]/generate-image
 *
 * Generates a branded image for a single_image content item
 * using the NativPost Image Engine (Puppeteer templates).
 *
 * Body (optional):
 *   template — "quote-card" | "announcement-card" | "stat-card" (default: auto-detected)
 *   style    — "dark" | "light" | "brand" (default: "dark")
 *   formats  — ["square"] | ["vertical"] | ["square","vertical"] (default: ["square","vertical"])
 *   statValue  — required if template is "stat-card"
 *   statLabel  — required if template is "stat-card"
 *   eyebrow    — optional label above content
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine — we'll use defaults
  }

  try {
    // Load content item
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, id))
      .limit(1);

    if (!item || item.orgId !== orgId) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    if (item.contentType !== 'single_image') {
      return NextResponse.json(
        { error: 'Image generation only available for single_image content type' },
        { status: 400 },
      );
    }

    // Load brand profile
    const [profile] = await db
      .select({
        brandName: brandProfileSchema.brandName,
        primaryColor: brandProfileSchema.primaryColor,
        secondaryColor: brandProfileSchema.secondaryColor,
        logoUrl: brandProfileSchema.logoUrl,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    // Auto-detect best template from caption if not specified
    const caption = item.caption || '';
    let template = (body.template as string) || 'quote-card';
    if (!body.template) {
      // Simple heuristics: stat pattern → stat-card, announcement keywords → announcement-card
      if (/\d+[%kmb+]|\$[\d,.]+/i.test(caption)) {
        template = 'stat-card';
      } else if (/launch|announc|introduc|new |milestone|hit \d|we just|today we/i.test(caption)) {
        template = 'announcement-card';
      }
    }

    const style = (body.style as string) || 'dark';
    const formats = (body.formats as string[]) || ['square', 'vertical'];

    // Build template-specific fields
    const templateFields: Record<string, unknown> = {};
    if (template === 'quote-card') {
      templateFields.quote = body.quote || caption;
      if (body.attribution) {
        templateFields.attribution = body.attribution;
      }
    } else if (template === 'announcement-card') {
      templateFields.headline = body.headline || caption.split('\n')[0] || caption.slice(0, 80);
      if (caption.includes('\n')) {
        templateFields.subtext = body.subtext || caption.split('\n').slice(1).join(' ').slice(0, 120);
      }
      if (body.cta) {
        templateFields.cta = body.cta;
      }
    } else if (template === 'stat-card') {
      if (!body.statValue || !body.statLabel) {
        return NextResponse.json(
          { error: 'statValue and statLabel are required for stat-card template' },
          { status: 400 },
        );
      }
      templateFields.statValue = body.statValue;
      templateFields.statLabel = body.statLabel;
      if (body.context) {
        templateFields.context = body.context;
      }
    }

    if (body.eyebrow) {
      templateFields.eyebrow = body.eyebrow;
    }

    const payload = {
      template,
      style,
      formats,
      brandName: profile?.brandName || 'Brand',
      brandPrimary: profile?.primaryColor || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#0D0D0D',
      ...(profile?.logoUrl ? { logoUrl: profile.logoUrl } : {}),
      ...templateFields,
    };

    console.log('[Image] Generating:', template, 'formats:', formats.join(','));

    // 60s timeout — Puppeteer render is fast but give room for warm-up
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    let renderRes: Response;
    try {
      renderRes = await fetch(`${IMAGE_ENGINE_URL}/render/image`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ENGINE_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      if (isAbort) {
        return NextResponse.json({ error: 'Image engine timed out. Please try again.' }, { status: 503 });
      }
      return NextResponse.json({ error: `Cannot reach image engine: ${String(fetchErr)}` }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      console.error('[Image] Engine error:', renderRes.status, errText);
      return NextResponse.json({ error: 'Image generation failed.', detail: errText }, { status: 502 });
    }

    const renderData = await renderRes.json() as {
      square?: string;
      vertical?: string;
      template: string;
      style: string;
      renderMs: number;
    };

    console.log('[Image] Generated:', renderData.square, renderData.vertical, `${renderData.renderMs}ms`);

    // Collect all returned URLs (square + vertical)
    const imageUrls = [renderData.square, renderData.vertical].filter(Boolean) as string[];

    if (imageUrls.length === 0) {
      return NextResponse.json({ error: 'Image engine returned no URLs' }, { status: 502 });
    }

    // Save to DB
    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: imageUrls,
        platformSpecific: {
          ...(item.platformSpecific as object),
          imageTemplate: template,
          imageStyle: style,
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      square: renderData.square,
      vertical: renderData.vertical,
      template: renderData.template,
      renderMs: renderData.renderMs,
    });
  } catch (err) {
    console.error('[Image] generate-image failed:', err);
    return NextResponse.json({ error: `Image generation failed: ${String(err)}` }, { status: 500 });
  }
}

import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  type RawTemplate,
  scrapeInstagramPosts,
  scrapeTikTokSlideshows,
} from '@/lib/template-seed';
import { enrichTemplateWithAI } from '@/lib/template-seed/ai';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

/**
 * NativPost admin guard — same check as middleware + AdminShell.
 * Must be org:admin AND the org must be the NativPost team org.
 */
async function requireAdmin() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized — sign in and select an organization' },
        { status: 401 },
      ),
      orgId: null,
    };
  }

  const teamOrgId = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;
  const isNativPostStaff = !!(
    teamOrgId && orgId === teamOrgId && orgRole === 'org:admin'
  );

  if (!isNativPostStaff) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden — NativPost admin access required' },
        { status: 403 },
      ),
      orgId: null,
    };
  }

  return { error: null, orgId };
}

// ── Input types ───────────────────────────────────────────────────────────

type TemplateStructureInput = {
  hook?: string;
  hookTime?: number;
  body?: string;
  bodyTime?: number;
  cta?: string;
  ctaTime?: number;
};

type ImportTemplatePayload = {
  sourceUrl: string;
  sourcePlatform: 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'linkedin' | 'twitter';
  contentType: 'slideshow' | 'wall_of_text' | 'talking_head' | 'green_screen_meme' | 'video_hook_demo' | 'carousel' | 'ugc' | 'custom';
  thumbnailUrl: string;
  creatorName?: string;
  niches?: string[];
  angles?: string[];
  engagementScore?: number;
  durationSeconds?: number;
  transcript?: string;
  structure?: TemplateStructureInput;
};

const VALID_PLATFORMS = [
  'tiktok',
  'instagram',
  'youtube',
  'facebook',
  'linkedin',
  'twitter',
];

const VALID_CONTENT_TYPES = [
  'slideshow',
  'wall_of_text',
  'talking_head',
  'green_screen_meme',
  'video_hook_demo',
  'carousel',
  'ugc',
  'custom',
];

function validateTemplate(
  t: ImportTemplatePayload,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!t.sourceUrl || typeof t.sourceUrl !== 'string') {
    errors.push('sourceUrl is required');
  } else if (!t.sourceUrl.startsWith('http')) {
    errors.push('sourceUrl must be a valid URL');
  }

  if (!t.sourcePlatform) {
    errors.push('sourcePlatform is required');
  } else if (!VALID_PLATFORMS.includes(t.sourcePlatform)) {
    errors.push(
      `sourcePlatform must be one of: ${VALID_PLATFORMS.join(', ')}`,
    );
  }

  if (!t.contentType) {
    errors.push('contentType is required');
  } else if (!VALID_CONTENT_TYPES.includes(t.contentType)) {
    errors.push(
      `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}`,
    );
  }

  if (!t.thumbnailUrl || typeof t.thumbnailUrl !== 'string') {
    errors.push('thumbnailUrl is required');
  } else if (!t.thumbnailUrl.startsWith('http')) {
    errors.push('thumbnailUrl must be a valid URL');
  }

  if (
    t.engagementScore !== undefined
    && (typeof t.engagementScore !== 'number'
      || t.engagementScore < 0
      || t.engagementScore > 1)
  ) {
    errors.push('engagementScore must be a number between 0 and 1');
  }

  if (
    t.durationSeconds !== undefined
    && (typeof t.durationSeconds !== 'number' || t.durationSeconds < 0)
  ) {
    errors.push('durationSeconds must be a non-negative number');
  }

  if (t.niches !== undefined && !Array.isArray(t.niches)) {
    errors.push('niches must be an array of strings');
  }

  if (t.angles !== undefined && !Array.isArray(t.angles)) {
    errors.push('angles must be an array of strings');
  }

  return { valid: errors.length === 0, errors };
}

function detectPlatformFromUrl(url: string): 'instagram' | 'tiktok' | null {
  const lower = url.toLowerCase();
  if (lower.includes('instagram.com')) {
    return 'instagram';
  }
  if (lower.includes('tiktok.com')) {
    return 'tiktok';
  }
  return null;
}

async function scrapeUrls(urls: string[]): Promise<{
  templates: RawTemplate[];
  errors: string[];
}> {
  const token = process.env.APIFY_TOKEN ?? '';
  if (!token) {
    return { templates: [], errors: ['APIFY_TOKEN is not configured'] };
  }

  const instagramUrls = urls.filter(u => detectPlatformFromUrl(u) === 'instagram');
  const tiktokUrls = urls.filter(u => detectPlatformFromUrl(u) === 'tiktok');
  const skipped = urls.filter(u => !detectPlatformFromUrl(u));

  const templates: RawTemplate[] = [];
  const errors: string[] = [];

  if (instagramUrls.length > 0) {
    try {
      const items = await scrapeInstagramPosts({
        apifyToken: token,
        urls: instagramUrls,
        limit: instagramUrls.length * 2,
      });
      templates.push(...items);
      if (items.length < instagramUrls.length) {
        errors.push(`Instagram scraping returned ${items.length}/${instagramUrls.length} posts`);
      }
    } catch (err) {
      errors.push(`Instagram scraping failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (tiktokUrls.length > 0) {
    try {
      const items = await scrapeTikTokSlideshows({
        apifyToken: token,
        urls: tiktokUrls,
        limit: tiktokUrls.length * 2,
      });
      templates.push(...items);
      if (items.length < tiktokUrls.length) {
        errors.push(`TikTok scraping returned ${items.length}/${tiktokUrls.length} posts`);
      }
    } catch (err) {
      errors.push(`TikTok scraping failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (skipped.length > 0) {
    errors.push(`Skipped ${skipped.length} unsupported URL(s) — only Instagram and TikTok are supported`);
  }

  return { templates, errors };
}

async function enrichTemplates(
  templates: RawTemplate[],
  apiKey: string,
): Promise<RawTemplate[]> {
  const enriched = await Promise.all(
    templates.map(async (template) => {
      try {
        const item = await enrichTemplateWithAI(template, apiKey);
        return {
          ...template,
          niches: item.niches,
          angles: item.angles,
          structure: item.structure,
          engagementScore: item.engagementScore,
        };
      } catch (err) {
        console.error(`[BulkImport] AI enrichment failed for ${template.sourceUrl}:`, err);
        return template;
      }
    }),
  );
  return enriched;
}

function buildStructure(
  structureInput?: TemplateStructureInput,
): Record<string, unknown> {
  if (!structureInput) {
    return {};
  }
  return {
    hook: {
      text: structureInput.hook || '',
      duration: structureInput.hookTime || 0,
      visualType: 'text_overlay',
    },
    body: {
      text: structureInput.body || '',
      duration: structureInput.bodyTime || 0,
    },
    cta: {
      text: structureInput.cta || '',
      duration: structureInput.ctaTime || 0,
    },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) {
    return error;
  }

  const db = await getDb();

  try {
    const body = await req.json();
    const { templates, urls, enrich = false } = body as {
      templates?: ImportTemplatePayload[];
      urls?: string[];
      enrich?: boolean;
    };

    const hasTemplates = Array.isArray(templates) && templates.length > 0;
    const hasUrls = Array.isArray(urls) && urls.length > 0;

    if (!hasTemplates && !hasUrls) {
      return NextResponse.json(
        { error: 'Invalid request: provide templates or urls' },
        { status: 400 },
      );
    }

    const errors: Array<{ index?: number; reason: string }> = [];
    const values: Record<string, unknown>[] = [];

    // ── Direct template import ─────────────────────────────────────────────
    if (hasTemplates) {
      if (templates.length > 1000) {
        return NextResponse.json(
          { error: 'Invalid request: maximum 1000 templates per batch' },
          { status: 400 },
        );
      }

      const validTemplates: ImportTemplatePayload[] = [];

      templates.forEach((t, index) => {
        const result = validateTemplate(t);
        if (result.valid) {
          validTemplates.push(t);
        } else {
          errors.push({ index, reason: result.errors.join('; ') });
        }
      });

      for (const t of validTemplates) {
        values.push({
          id: crypto.randomUUID(),
          sourceUrl: t.sourceUrl,
          sourcePlatform: t.sourcePlatform,
          sourceCreator: t.creatorName || null,
          sourceVideoId: null,
          sourcePostId: null,
          mediaUrl: t.sourceUrl,
          thumbnailUrl: t.thumbnailUrl,
          thumbnailUrls: {},
          slideCaptions: {},
          durationSeconds: t.durationSeconds || null,
          contentType: t.contentType,
          niches: t.niches || [],
          angles: t.angles || [],
          structure: buildStructure(t.structure),
          engagementScore: t.engagementScore || null,
          viewCount: null,
          likeCount: null,
          shareCount: null,
          commentCount: null,
          curationStatus: 'pending',
          curatedBy: null,
          curatedAt: null,
          remixCount: 0,
          publishCount: 0,
          avgRemixPerformance: null,
          isActive: true,
          trainingUsed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // ── URL scraping import ────────────────────────────────────────────────
    if (hasUrls) {
      if (urls.length > 50) {
        return NextResponse.json(
          { error: 'Invalid request: maximum 50 URLs per batch' },
          { status: 400 },
        );
      }

      const { templates: scraped, errors: scrapeErrors } = await scrapeUrls(urls);
      scrapeErrors.forEach(reason => errors.push({ reason }));

      let enriched = scraped;
      if (enrich) {
        const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicApiKey) {
          return NextResponse.json(
            { error: 'ANTHROPIC_API_KEY is not configured' },
            { status: 400 },
          );
        }
        enriched = await enrichTemplates(scraped, anthropicApiKey);
      }

      for (const t of enriched) {
        values.push({
          id: crypto.randomUUID(),
          sourceUrl: t.sourceUrl,
          sourcePlatform: t.sourcePlatform,
          sourceCreator: t.sourceCreator,
          sourceVideoId: t.sourceVideoId,
          sourcePostId: t.sourcePostId,
          mediaUrl: t.mediaUrl,
          thumbnailUrl: t.thumbnailUrl,
          thumbnailUrls: Array.isArray(t.thumbnailUrls) ? t.thumbnailUrls : {},
          slideCaptions: Array.isArray(t.slideCaptions) ? t.slideCaptions : {},
          durationSeconds: t.durationSeconds,
          contentType: t.contentType,
          niches: (t as { niches?: string[] }).niches || [],
          angles: (t as { angles?: string[] }).angles || [],
          structure: (t as { structure?: Record<string, unknown> }).structure || {},
          engagementScore: (t as { engagementScore?: number }).engagementScore || null,
          viewCount: t.viewCount,
          likeCount: t.likeCount,
          shareCount: null,
          commentCount: null,
          curationStatus: 'pending',
          curatedBy: null,
          curatedAt: null,
          remixCount: 0,
          publishCount: 0,
          avgRemixPerformance: null,
          isActive: true,
          trainingUsed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Insert into the database
    const inserted
      = values.length > 0
        ? await db
          .insert(contentTemplateSchema)
          .values(values as never)
          .onConflictDoNothing({ target: contentTemplateSchema.sourceUrl })
          .returning()
        : [];

    return NextResponse.json(
      {
        imported: inserted.length,
        errors,
        total: (templates?.length ?? 0) + (urls?.length ?? 0),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('Bulk import error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

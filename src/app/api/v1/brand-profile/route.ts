/**
 * GET   /api/v1/brand-profile — fetch the org's primary brand profile
 * PATCH /api/v1/brand-profile — update mutable brand fields
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { apiError, apiOk } from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { getDb } from '@/libs/DB';
import { brandProfileSchema } from '@/models/Schema';

const PatchSchema = z.object({
  brand_name: z.string().min(1).max(160).optional(),
  industry: z.string().max(80).nullable().optional(),
  target_audience: z.string().max(500).nullable().optional(),
  company_description: z.string().max(2000).nullable().optional(),
  website_url: z.string().url().max(500).nullable().optional(),
  tone_formality: z.number().int().min(0).max(10).optional(),
  tone_humor: z.number().int().min(0).max(10).optional(),
  tone_energy: z.number().int().min(0).max(10).optional(),
  vocabulary: z.array(z.string()).max(100).optional(),
  forbidden_words: z.array(z.string()).max(100).optional(),
  primary_color: z.string().max(20).nullable().optional(),
  secondary_color: z.string().max(20).nullable().optional(),
  accent_color: z.string().max(20).nullable().optional(),
  hashtag_strategy: z.string().max(500).nullable().optional(),
});

function serialize(row: typeof brandProfileSchema.$inferSelect) {
  return {
    id: row.id,
    object: 'brand_profile' as const,
    brand_name: row.brandName,
    industry: row.industry,
    target_audience: row.targetAudience,
    company_description: row.companyDescription,
    website_url: row.websiteUrl,
    tone: {
      formality: row.toneFormality,
      humor: row.toneHumor,
      energy: row.toneEnergy,
    },
    vocabulary: (row.vocabulary as string[] | null) ?? [],
    forbidden_words: (row.forbiddenWords as string[] | null) ?? [],
    colors: {
      primary: row.primaryColor,
      secondary: row.secondaryColor,
      accent: row.accentColor,
    },
    hashtag_strategy: row.hashtagStrategy,
    profile_completeness: row.profileCompleteness ?? 0,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const db = await getDb();
  const [row] = await db
    .select()
    .from(brandProfileSchema)
    .where(eq(brandProfileSchema.orgId, ctx.orgId))
    .limit(1);

  if (!row) return apiError(404, 'not_found', 'Brand profile not set up yet.');
  return apiOk(serialize(row));
}

export async function PATCH(request: NextRequest) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'invalid_body', 'Request body must be valid JSON.');
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'invalid_body', 'Validation failed.', { details: parsed.error.flatten() });
  }

  const updates: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.brand_name !== undefined) updates.brandName = d.brand_name;
  if (d.industry !== undefined) updates.industry = d.industry;
  if (d.target_audience !== undefined) updates.targetAudience = d.target_audience;
  if (d.company_description !== undefined) updates.companyDescription = d.company_description;
  if (d.website_url !== undefined) updates.websiteUrl = d.website_url;
  if (d.tone_formality !== undefined) updates.toneFormality = d.tone_formality;
  if (d.tone_humor !== undefined) updates.toneHumor = d.tone_humor;
  if (d.tone_energy !== undefined) updates.toneEnergy = d.tone_energy;
  if (d.vocabulary !== undefined) updates.vocabulary = d.vocabulary;
  if (d.forbidden_words !== undefined) updates.forbiddenWords = d.forbidden_words;
  if (d.primary_color !== undefined) updates.primaryColor = d.primary_color;
  if (d.secondary_color !== undefined) updates.secondaryColor = d.secondary_color;
  if (d.accent_color !== undefined) updates.accentColor = d.accent_color;
  if (d.hashtag_strategy !== undefined) updates.hashtagStrategy = d.hashtag_strategy;

  if (Object.keys(updates).length === 0) {
    return apiError(400, 'no_updates', 'Request body has no updatable fields.');
  }

  const db = await getDb();
  const [row] = await db
    .update(brandProfileSchema)
    .set(updates)
    .where(and(eq(brandProfileSchema.orgId, ctx.orgId)))
    .returning();

  if (!row) return apiError(404, 'not_found', 'Brand profile not set up yet.');
  return apiOk(serialize(row));
}

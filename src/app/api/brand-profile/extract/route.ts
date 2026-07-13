import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { generateContentAnglesFromProfile } from '@/lib/onboarding/generate-content-angles';

const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

// -----------------------------------------------------------
// POST /api/brand-profile/extract
//
// Onboarding shortcut: the user gives us a URL instead of building a brand
// profile from scratch. We forward it to the engine, which scrapes the site
// and returns a partial profile. The dashboard pre-fills the brand profile
// form with the response — nothing here is saved automatically. The user
// still reviews and submits the form themselves.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }

  let body: {
    url?: string;
    brandName?: string;
    sourceType?: string;
    sourceHandle?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ error: 'A website URL is required' }, { status: 400 });
  }

  // Phase 1 social-profile onboarding. Any unknown value falls back to
  // 'website' on the engine side; the engine's Pydantic Literal accepts
  // exactly this set.
  const ALLOWED_SOURCE_TYPES = new Set([
    'website',
    'instagram',
    'tiktok',
    'twitter',
    'linktree',
    'youtube',
  ]);
  const sourceType = ALLOWED_SOURCE_TYPES.has(String(body.sourceType || ''))
    ? String(body.sourceType)
    : 'website';
  const sourceHandle = typeof body.sourceHandle === 'string'
    ? body.sourceHandle.trim() || null
    : null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let engineResponse: Response;
  try {
    engineResponse = await fetch(`${ENGINE_URL}/api/brand-profile/extract`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENGINE_API_KEY}`,
      },
      body: JSON.stringify({
        url,
        brand_name: body.brandName || null,
        source_type: sourceType,
        source_handle: sourceHandle,
      }),
    });
  } catch (fetchErr: any) {
    clearTimeout(timeoutId);
    if (fetchErr.name === 'AbortError') {
      return NextResponse.json(
        { error: 'That site took too long to read. Try a different page, or fill in your brand profile manually.' },
        { status: 504 },
      );
    }
    console.error('[Brand Profile Extract] Engine request failed:', fetchErr);
    return NextResponse.json(
      { error: 'Could not reach the content engine. Please try again.' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!engineResponse.ok) {
    let detail = 'Could not extract a brand profile from that URL.';
    try {
      const errBody = await engineResponse.json();
      detail = errBody.detail || detail;
    } catch {
      // engine returned a non-JSON error body — fall back to the default message
    }
    return NextResponse.json({ error: detail }, { status: engineResponse.status });
  }

  const data = await engineResponse.json();

  // Map the engine's snake_case profile onto the camelCase shape the
  // brand profile form already uses, so the form needs no extra mapping logic.
  const p = data.profile || {};
  const mapped = {
    brandName: p.brand_name ?? null,
    industry: p.industry ?? null,
    targetAudience: p.target_audience ?? null,
    companyDescription: p.company_description ?? null,
    toneFormality: p.tone_formality ?? null,
    toneHumor: p.tone_humor ?? null,
    toneEnergy: p.tone_energy ?? null,
    vocabulary: p.vocabulary ?? [],
    communicationStyle: p.communication_style ?? null,
    contentExamples: p.content_examples ?? [],
    mission: p.mission ?? null,
    values: p.values ?? [],
    productsServices: p.products_services ?? [],
    keyDifferentiators: p.key_differentiators ?? null,
  };

  // Generate content angles from the scraped profile. Failures are
  // non-fatal - onboarding continues with an empty angle list.
  // When the engine returned partial=true (adapter soft-failure) we skip
  // the angles call — there's not enough signal to produce useful angles
  // and the client is going to drop the user into "Describe it" anyway.
  const isPartial = Boolean(data.partial);
  const angles = isPartial
    ? []
    : await generateContentAnglesFromProfile(mapped).catch(() => []);

  return NextResponse.json(
    {
      profile: mapped,
      fieldsFound: data.fields_found ?? [],
      pagesScraped: data.pages_scraped ?? [],
      sourceUrl: data.source_url ?? url,
      // Provenance echoed back so the client can persist it on the brand
      // profile row (see Schema.ts: brandProfileSource / brandProfileSourceHandle).
      sourceType: data.source_type ?? sourceType,
      sourceHandle: data.source_handle ?? sourceHandle,
      partial: isPartial,
      partialReason: data.partial_reason ?? null,
      angles,
    },
    { status: 200 },
  );
}

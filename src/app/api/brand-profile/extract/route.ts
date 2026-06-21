import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';

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

  let body: { url?: string; brandName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ error: 'A website URL is required' }, { status: 400 });
  }

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

  return NextResponse.json(
    {
      profile: mapped,
      fieldsFound: data.fields_found ?? [],
      pagesScraped: data.pages_scraped ?? [],
      sourceUrl: data.source_url ?? url,
    },
    { status: 200 },
  );
}

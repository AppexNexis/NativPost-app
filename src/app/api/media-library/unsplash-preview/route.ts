import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const UNSPLASH_API = 'https://api.unsplash.com';

// -----------------------------------------------------------
// GET /api/media-library/unsplash-preview?query=...&w=300&page=1
//
// Redirects to a real Unsplash image matching the query. `page` lets
// the curated-theme picker and preview grid request several
// *different* photos for the same query — Unsplash's search endpoint
// returns a distinct result per page number when per_page=1.
//
// Caches the lookup for a day via Next's fetch cache, since theme
// queries barely change and this keeps repeated grid renders (the
// picker alone renders 60+ thumbnails) well inside Unsplash's hourly
// rate limit.
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  if (!UNSPLASH_ACCESS_KEY) {
    return NextResponse.json({ error: 'UNSPLASH_ACCESS_KEY is not configured.' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const width = Math.min(Number(searchParams.get('w') || 400), 1600);
  const page = Math.max(Number(searchParams.get('page') || 1), 1);

  if (!query) {
    return NextResponse.json({ error: 'query parameter is required.' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=1&orientation=squarish`,
      {
        headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
        next: { revalidate: 86400 },
      },
    );

    if (!res.ok) {
      console.error('[MediaLibrary] Unsplash error:', res.status, await res.text());
      return NextResponse.json({ error: 'Unsplash request failed.' }, { status: 502 });
    }

    const data = await res.json();
    const photo = data.results?.[0];

    if (!photo?.urls?.raw) {
      return NextResponse.json({ error: 'No image found for this query.' }, { status: 404 });
    }

    const imageUrl = `${photo.urls.raw}&w=${width}&fit=crop&q=80`;
    return NextResponse.redirect(imageUrl, { status: 302 });
  } catch (err) {
    console.error('[MediaLibrary] Unsplash preview error:', err);
    return NextResponse.json({ error: 'Failed to fetch preview image.' }, { status: 500 });
  }
}
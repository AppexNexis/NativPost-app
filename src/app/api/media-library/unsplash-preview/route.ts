// import type { NextRequest } from 'next/server';
// import { NextResponse } from 'next/server';

// const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
// const UNSPLASH_API = 'https://api.unsplash.com';

// // -----------------------------------------------------------
// // GET /api/media-library/unsplash-preview?query=...&w=300&page=1
// //
// // Redirects to a real Unsplash image matching the query. `page` lets
// // the curated-theme picker and preview grid request several
// // *different* photos for the same query — Unsplash's search endpoint
// // returns a distinct result per page number when per_page=1.
// //
// // Caches the lookup for a day via Next's fetch cache, since theme
// // queries barely change and this keeps repeated grid renders (the
// // picker alone renders 60+ thumbnails) well inside Unsplash's hourly
// // rate limit.
// // -----------------------------------------------------------
// export async function GET(request: NextRequest) {
//   if (!UNSPLASH_ACCESS_KEY) {
//     return NextResponse.json({ error: 'UNSPLASH_ACCESS_KEY is not configured.' }, { status: 500 });
//   }

//   const { searchParams } = new URL(request.url);
//   const query = searchParams.get('query');
//   const width = Math.min(Number(searchParams.get('w') || 400), 1600);
//   const page = Math.max(Number(searchParams.get('page') || 1), 1);

//   if (!query) {
//     return NextResponse.json({ error: 'query parameter is required.' }, { status: 400 });
//   }

//   try {
//     const res = await fetch(
//       `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=1&orientation=squarish`,
//       {
//         headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
//         next: { revalidate: 86400 },
//       },
//     );

//     if (!res.ok) {
//       console.error('[MediaLibrary] Unsplash error:', res.status, await res.text());
//       return NextResponse.json({ error: 'Unsplash request failed.' }, { status: 502 });
//     }

//     const data = await res.json();
//     const photo = data.results?.[0];

//     if (!photo?.urls?.raw) {
//       return NextResponse.json({ error: 'No image found for this query.' }, { status: 404 });
//     }

//     const imageUrl = `${photo.urls.raw}&w=${width}&fit=crop&q=80`;
//     return NextResponse.redirect(imageUrl, { status: 302 });
//   } catch (err) {
//     console.error('[MediaLibrary] Unsplash preview error:', err);
//     return NextResponse.json({ error: 'Failed to fetch preview image.' }, { status: 500 });
//   }
// }

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const UNSPLASH_API = 'https://api.unsplash.com';

// ---------------------------------------------------------------------------
// GET /api/media-library/unsplash-preview?query=...&w=300&page=1
//
// KEY CHANGE from previous version: we PROXY the image bytes instead of
// redirecting. Redirecting to images.unsplash.com fails because:
//   1. Next.js <Image> blocks domains not in next.config.js remotePatterns
//   2. Native <img> follows the redirect but Unsplash signed URLs have
//      short TTLs that break when cached
//
// Proxying means the browser only ever talks to app.nativpost.com — no
// domain allowlisting needed, no TTL issues, no CORS issues.
//
// We cache the upstream Unsplash fetch for 24 hours with Next.js fetch
// cache so repeated grid renders (curated picker shows 60+ thumbnails)
// stay well inside Unsplash's 1000 req/hour limit.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  if (!UNSPLASH_ACCESS_KEY) {
    return new NextResponse('UNSPLASH_ACCESS_KEY not configured', { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const width = Math.min(Number(searchParams.get('w') || 400), 1600);
  const page = Math.max(Number(searchParams.get('page') || 1), 1);

  if (!query) {
    return new NextResponse('query parameter is required', { status: 400 });
  }

  try {
    // Step 1: Search Unsplash for the photo URL (cached 24h)
    const searchRes = await fetch(
      `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=1&orientation=squarish`,
      {
        headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
        next: { revalidate: 86400 }, // Cache the search result for 24 hours
      },
    );

    if (!searchRes.ok) {
      console.error('[unsplash-preview] Search failed:', searchRes.status);
      return new NextResponse('Unsplash search failed', { status: 502 });
    }

    const data = await searchRes.json();
    const photo = data.results?.[0];

    if (!photo?.urls?.raw) {
      return new NextResponse('No image found for this query', { status: 404 });
    }

    // Build the sized URL — Unsplash raw URL + Imgix params
    const imageUrl = `${photo.urls.raw}&w=${width}&h=${width}&fit=crop&q=80&auto=format`;

    // Step 2: Fetch the actual image bytes and proxy them (cached 24h)
    const imgRes = await fetch(imageUrl, {
      next: { revalidate: 86400 },
    });

    if (!imgRes.ok) {
      console.error('[unsplash-preview] Image fetch failed:', imgRes.status);
      return new NextResponse('Failed to fetch image', { status: 502 });
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch (err) {
    console.error('[unsplash-preview] Error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
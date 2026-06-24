// import type { NextRequest } from 'next/server';
// import { NextResponse } from 'next/server';
// import { getThemeQueries } from '@/libs/curatedThemes'; // Adjust this import path if needed

// const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
// const UNSPLASH_API = 'https://api.unsplash.com';

// // ---------------------------------------------------------------------------
// // GET /api/media-library/unsplash-preview
// //
// // Proxies a single Unsplash photo back to the client. Proxying ensures the 
// // browser only talks to the primary domain, avoiding Next.js <Image> domain 
// // blocking and short TTL issues on signed Unsplash URLs.
// //
// // Query params (two modes — use ONE):
// //   ?theme=<themeId>&w=<width>&page=<n>
// //     Looks up the CuratedTheme by id, rotates through its primary query
// //     and all fallbackQueries by page number, and retries each query in
// //     order until at least one photo is found.
// //
// //   ?query=<string>&w=<width>&page=<n>
// //     Legacy mode — searches a raw query string directly (no fallbacks).
// // ---------------------------------------------------------------------------
// export async function GET(request: NextRequest) {
//   if (!UNSPLASH_ACCESS_KEY) {
//     return new NextResponse('UNSPLASH_ACCESS_KEY not configured', { status: 500 });
//   }

//   const { searchParams } = new URL(request.url);
//   const themeId = searchParams.get('theme');
//   const rawQuery = searchParams.get('query');
//   const w = Math.min(Number(searchParams.get('w') || 300), 1600);
//   const page = Math.max(Number(searchParams.get('page') || 1), 1);

//   // ------------------------------------------------------------------
//   // Resolve the ordered list of queries to try
//   // ------------------------------------------------------------------
//   let queries: string[] = [];

//   if (themeId) {
//     // Theme mode: rotate primary + fallbacks by page so each page number
//     // tends to pull from a different search, widening the image pool.
//     const allQueries = getThemeQueries(themeId);

//     if (allQueries.length === 0) {
//       return new NextResponse('Unknown theme', { status: 404 });
//     }

//     // Start at the query index that corresponds to this page
//     const startIndex = (page - 1) % allQueries.length;
//     queries = [
//       ...allQueries.slice(startIndex),
//       ...allQueries.slice(0, startIndex),
//     ];
//   } else if (rawQuery) {
//     // Legacy mode: single query, no fallbacks
//     queries = [rawQuery];
//   } else {
//     return new NextResponse('Missing `theme` or `query` param', { status: 400 });
//   }

//   // ------------------------------------------------------------------
//   // Try each query in order until we get a result
//   // ------------------------------------------------------------------
//   const PER_PAGE = 30;

//   for (const query of queries) {
//     let innerPage = page;

//     // For theme-rotated queries, keep the real page small to stay within API caps.
//     if (themeId) {
//       innerPage = ((page - 1) % 10) + 1;
//     }

//     try {
//       // Step 1: Search Unsplash for the photo URL (cached 24h)
//       const searchRes = await fetch(
//         `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&page=${innerPage}&per_page=${PER_PAGE}&orientation=squarish`,
//         {
//           headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
//           next: { revalidate: 86400 }, // Native Next.js cache 
//         }
//       );

//       if (!searchRes.ok) {
//         continue; // Try the next fallback
//       }

//       const data = await searchRes.json();
//       const photos = data.results || [];

//       if (photos.length === 0) {
//         continue; // No results — try the next fallback
//       }

//       // Pick a deterministic photo within this result set
//       const photo = photos[(page - 1) % photos.length];

//       if (!photo?.urls?.raw) {
//         continue;
//       }

//       // Build the sized URL — Unsplash raw URL + Imgix params
//       const imageUrl = `${photo.urls.raw}&w=${w}&h=${w}&fit=crop&q=80&auto=format`;

//       // Step 2: Fetch the actual image bytes and proxy them (cached 24h)
//       const imgRes = await fetch(imageUrl, {
//         next: { revalidate: 86400 },
//       });

//       if (!imgRes.ok) {
//         continue;
//       }

//       const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
//       const buffer = await imgRes.arrayBuffer();

//       return new NextResponse(buffer, {
//         status: 200,
//         headers: {
//           'Content-Type': contentType,
//           'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
//           'Content-Length': String(buffer.byteLength),
//         },
//       });
//     } catch (err) {
//       console.error(`[unsplash-preview] Error fetching query "${query}":`, err);
//       continue;
//     }
//   }

//   // All queries exhausted with no result
//   console.warn(`[unsplash-preview] No photos found for theme="${themeId}" query="${rawQuery}" page=${page}`);
//   return new NextResponse('No photos found', { status: 404 });
// }


import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getThemeQueries } from '@/libs/curatedThemes'; // Adjust this import path if needed

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || '';
const UNSPLASH_API = 'https://api.unsplash.com';

// ---------------------------------------------------------------------------
// GET /api/media-library/unsplash-preview
//
// Proxies a single Unsplash photo back to the client. Proxying ensures the 
// browser only talks to the primary domain, avoiding Next.js <Image> domain 
// blocking and short TTL issues on signed Unsplash URLs.
//
// Query params (two modes — use ONE):
//   ?theme=<themeId>&w=<width>&page=<n>
//     Looks up the CuratedTheme by id, rotates through its primary query
//     and all fallbackQueries by page number, and retries each query in
//     order until at least one photo is found.
//
//   ?query=<string>&w=<width>&page=<n>
//     Legacy mode — searches a raw query string directly (no fallbacks).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  if (!UNSPLASH_ACCESS_KEY) {
    console.error('[unsplash-preview] UNSPLASH_ACCESS_KEY not configured');
    return new NextResponse('UNSPLASH_ACCESS_KEY not configured', { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const themeId = searchParams.get('theme');
  const rawQuery = searchParams.get('query');
  const w = Math.min(Number(searchParams.get('w') || 300), 1600);
  const page = Math.max(Number(searchParams.get('page') || 1), 1);

  // ------------------------------------------------------------------
  // Resolve the ordered list of queries to try
  // ------------------------------------------------------------------
  let queries: string[] = [];

  if (themeId) {
    // Theme mode: rotate primary + fallbacks by page so each page number
    // tends to pull from a different search, widening the image pool.
    const allQueries = getThemeQueries(themeId);

    if (allQueries.length === 0) {
      console.error(`[unsplash-preview] Unknown theme="${themeId}"`);
      return new NextResponse('Unknown theme', { status: 404 });
    }

    // Start at the query index that corresponds to this page
    const startIndex = (page - 1) % allQueries.length;
    queries = [
      ...allQueries.slice(startIndex),
      ...allQueries.slice(0, startIndex),
    ];
  } else if (rawQuery) {
    // Legacy mode: single query, no fallbacks
    queries = [rawQuery];
  } else {
    console.error('[unsplash-preview] Missing `theme` or `query` param');
    return new NextResponse('Missing `theme` or `query` param', { status: 400 });
  }

  // ------------------------------------------------------------------
  // Try each query in order until we get a result
  // ------------------------------------------------------------------
  const PER_PAGE = 30;

  for (const query of queries) {
    let innerPage = page;

    // For theme-rotated queries, keep the real page small to stay within API caps.
    if (themeId) {
      innerPage = ((page - 1) % 10) + 1;
    }

    try {
      // Step 1: Search Unsplash for the photo URL (cached 24h)
      const searchRes = await fetch(
        `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&page=${innerPage}&per_page=${PER_PAGE}&orientation=squarish`,
        {
          headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
          next: { revalidate: 86400 }, // Native Next.js cache 
        }
      );

      if (!searchRes.ok) {
        // NEW: surface the actual Unsplash error instead of swallowing it.
        // 401 = bad/mismatched access key, 403 = app not approved/rate-limited,
        // 422 = malformed query. This is the line that tells us what's really wrong.
        const body = await searchRes.text().catch(() => '');
        console.error(
          `[unsplash-preview] Search FAILED query="${query}" theme="${themeId}" status=${searchRes.status} body="${body.slice(0, 300)}"`
        );
        continue; // Try the next fallback
      }

      const data = await searchRes.json();
      const photos = data.results || [];

      if (photos.length === 0) {
        // NEW: distinguish "API call succeeded but zero matches" from a failed call.
        console.warn(
          `[unsplash-preview] Search OK but 0 results for query="${query}" theme="${themeId}" innerPage=${innerPage}`
        );
        continue; // No results — try the next fallback
      }

      // Pick a deterministic photo within this result set
      const photo = photos[(page - 1) % photos.length];

      if (!photo?.urls?.raw) {
        // NEW: log the malformed photo object so we can see what Unsplash actually sent.
        console.error(`[unsplash-preview] Photo missing urls.raw for query="${query}"`, JSON.stringify(photo));
        continue;
      }

      // Build the sized URL — Unsplash raw URL + Imgix params
      const imageUrl = `${photo.urls.raw}&w=${w}&h=${w}&fit=crop&q=80&auto=format`;

      // Step 2: Fetch the actual image bytes and proxy them (cached 24h)
      const imgRes = await fetch(imageUrl, {
        next: { revalidate: 86400 },
      });

      if (!imgRes.ok) {
        // NEW: log if the signed raw URL itself failed to fetch (e.g. expired signature).
        console.error(
          `[unsplash-preview] Image fetch FAILED url="${imageUrl}" status=${imgRes.status}`
        );
        continue;
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
      console.error(`[unsplash-preview] Exception while fetching query="${query}":`, err);
      continue;
    }
  }

  // All queries exhausted with no result
  console.warn(`[unsplash-preview] No photos found for theme="${themeId}" query="${rawQuery}" page=${page} triedQueries=${JSON.stringify(queries)}`);
  return new NextResponse('No photos found', { status: 404 });
}
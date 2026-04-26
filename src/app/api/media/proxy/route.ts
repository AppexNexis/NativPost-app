import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// -----------------------------------------------------------
// GET /api/media/proxy?url=<encoded-uploadcare-url>
//
// Proxies video/image files from Uploadcare CDN through
// app.nativpost.com so TikTok's domain ownership check passes.
//
// Why this exists:
//   TikTok's PULL_FROM_URL requires the video URL to belong to a
//   domain verified in the TikTok developer portal. Uploadcare's
//   CDN (ucarecdn.com) is not our domain. nativpost.com IS verified
//   in TikTok's portal, and as a verified base domain it covers all
//   subdomains including app.nativpost.com.
//
// TikTok requirements this route satisfies:
//   - URL must use https ✓ (enforced by app.nativpost.com)
//   - URL must NOT redirect ✓ (we stream directly, no Location header)
//   - URL must remain accessible for up to 1 hour ✓ (always-on route)
//   - Content-Length header recommended for large files ✓ (passed through)
// -----------------------------------------------------------

// Security: only proxy from known Uploadcare CDN hostnames
const ALLOWED_CDN_HOSTS = [
  'ucarecdn.com',
  '32v3ws8ss0.ucarecd.net',
  '9c0v643oty.ucarecd.net',
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url');

  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Enforce https — TikTok rejects http sources
  if (targetUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only https URLs are allowed' }, { status: 400 });
  }

  // Security: only proxy from our known Uploadcare CDN hostnames
  const hostAllowed = ALLOWED_CDN_HOSTS.some(
    host => targetUrl.hostname === host || targetUrl.hostname.endsWith(`.${host}`),
  );
  if (!hostAllowed) {
    return NextResponse.json({ error: 'URL host not allowed' }, { status: 403 });
  }

  try {
    const upstreamHeaders: Record<string, string> = {};

    // Pass through range requests so TikTok can resume partial downloads
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      upstreamHeaders.Range = rangeHeader;
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: upstreamHeaders,
      // Abort if Uploadcare doesn't respond within 30s
      signal: AbortSignal.timeout(30_000),
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `Upstream fetch failed: ${upstream.status}` },
        { status: upstream.status },
      );
    }

    // Build response headers — pass through everything TikTok needs
    const responseHeaders: Record<string, string> = {
      // 24-hour cache so TikTok can re-fetch within its 1-hour download window
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    };

    const contentType = upstream.headers.get('content-type');
    if (contentType) {
      responseHeaders['Content-Type'] = contentType;
    }

    // Content-Length is important — TikTok uses it to validate file size
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength;
    }

    // Pass through range response headers
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange;
    }

    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) {
      responseHeaders['Accept-Ranges'] = acceptRanges;
    }

    // Stream the body directly — no buffering in memory
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      console.error('[Media Proxy] Upstream timeout:', targetUrl.hostname);
      return NextResponse.json({ error: 'Upstream timed out' }, { status: 504 });
    }
    console.error('[Media Proxy] Error:', err);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 500 });
  }
}

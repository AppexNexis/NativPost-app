import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// -----------------------------------------------------------
// GET /api/media/proxy?url=<encoded-uploadcare-url>
//
// Proxies video/image files from Uploadcare CDN through
// app.nativpost.com so TikTok's domain verification passes.
//
// TikTok requires pull_by_url sources to come from a verified
// domain. Since Uploadcare's CDN (32v3ws8ss0.ucarecd.net)
// cannot be verified, we proxy through our own verified domain.
//
// Usage: /api/media/proxy?url=https%3A%2F%2F32v3ws8ss0...
// -----------------------------------------------------------

// Only allow proxying from our Uploadcare CDN
const ALLOWED_CDN_HOSTS = [
  '32v3ws8ss0.ucarecd.net',
  'ucarecdn.com',
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

  // Security: only proxy from allowed CDN hosts
  if (!ALLOWED_CDN_HOSTS.some(host => targetUrl.hostname.endsWith(host))) {
    return NextResponse.json({ error: 'URL host not allowed' }, { status: 403 });
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        // Pass through range requests for video streaming
        ...(request.headers.get('range')
          ? { Range: request.headers.get('range')! }
          : {}),
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed: ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const contentType = upstream.headers.get('content-type') || 'video/mp4';
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400', // 24h cache
      'Access-Control-Allow-Origin': '*',
    };

    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }
    if (contentRange) {
      headers['Content-Range'] = contentRange;
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    console.error('[Media Proxy] Error:', err);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 500 });
  }
}

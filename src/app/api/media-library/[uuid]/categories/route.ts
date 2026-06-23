import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';

const UC_PUB_KEY = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || '';
const UC_SECRET_KEY = process.env.UPLOADCARE_SECRET_KEY || '';
const UC_API = 'https://api.uploadcare.com';

function ucAuthHeader() {
  return `Uploadcare.Simple ${UC_PUB_KEY}:${UC_SECRET_KEY}`;
}

// -----------------------------------------------------------
// PATCH /api/media-library/[uuid]/categories
// Body: { categories: string[] }
//
// Categories are stored as a JSON-encoded array string in the file's
// Uploadcare metadata — same mechanism already used for orgId tagging
// in /api/media-library/route.ts. No DB table needed for this part.
//
// Note: Uploadcare metadata values are capped at 256 characters, so
// this comfortably covers a handful of category names but isn't
// unlimited — we reject the request before hitting that cap.
//
// If you're on Next.js 13/14 (sync route params), change the second
// argument's type to `{ params: { uuid: string } }` and drop the await.
// -----------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }

  if (!UC_SECRET_KEY) {
    return NextResponse.json({ error: 'UPLOADCARE_SECRET_KEY is not configured.' }, { status: 500 });
  }

  const { uuid } = await params;
  const body = await request.json().catch(() => null);
  const categories = Array.isArray(body?.categories) ? (body.categories as string[]) : null;

  if (!categories) {
    return NextResponse.json({ error: 'categories array is required.' }, { status: 400 });
  }

  const encoded = JSON.stringify(categories);
  if (encoded.length > 256) {
    return NextResponse.json(
      { error: 'Too many categories — Uploadcare metadata values are capped at 256 characters.' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${UC_API}/files/${uuid}/metadata/categories/`, {
      method: 'PUT',
      headers: {
        Authorization: ucAuthHeader(),
        Accept: 'application/vnd.uploadcare-v0.7+json',
        'Content-Type': 'application/json',
      },
      // Uploadcare metadata values are raw strings — we send our
      // JSON-encoded array as a JSON-encoded string value.
      body: JSON.stringify(encoded),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[MediaLibrary] Uploadcare metadata error:', res.status, text);
      return NextResponse.json({ error: 'Failed to update categories on Uploadcare.' }, { status: 502 });
    }

    return NextResponse.json({ uuid, categories });
  } catch (err) {
    console.error('[MediaLibrary] Categories PATCH error:', err);
    return NextResponse.json({ error: 'Failed to update categories.' }, { status: 500 });
  }
}
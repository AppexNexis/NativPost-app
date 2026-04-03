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
// POST /api/media-library/tag
// Called immediately after a file is uploaded via the widget.
// Tags the file with the current org's ID so it appears only
// in that org's media library.
//
// Body: { uuid: string }
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  if (!UC_SECRET_KEY) {
    return NextResponse.json(
      { error: 'UPLOADCARE_SECRET_KEY is not configured.' },
      { status: 500 },
    );
  }

  let uuid: string;
  try {
    const body = await request.json();
    uuid = body.uuid;
    if (!uuid || typeof uuid !== 'string') {
      throw new Error('invalid');
    }
  } catch {
    return NextResponse.json({ error: 'Missing or invalid uuid.' }, { status: 400 });
  }

  try {
    // PUT /files/{uuid}/metadata/{key}/ sets a single metadata value.
    // The body must be a JSON-encoded string (including the quotes).
    const res = await fetch(`${UC_API}/files/${uuid}/metadata/orgId/`, {
      method: 'PUT',
      headers: {
        'Authorization': ucAuthHeader(),
        'Accept': 'application/vnd.uploadcare-v0.7+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orgId),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[MediaLibrary/tag] Uploadcare metadata error:', text);
      return NextResponse.json({ error: 'Failed to tag file.' }, { status: 502 });
    }

    return NextResponse.json({ tagged: true, uuid, orgId });
  } catch (err) {
    console.error('[MediaLibrary/tag] Error:', err);
    return NextResponse.json({ error: 'Failed to tag file.' }, { status: 500 });
  }
}

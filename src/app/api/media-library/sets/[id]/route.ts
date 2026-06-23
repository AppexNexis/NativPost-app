import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { mediaSetSchema } from '@/models/Schema';

// -----------------------------------------------------------
// DELETE /api/media-library/sets/[id]
// Deletes the set row. Asset UUIDs live in a jsonb column on the
// set itself (no child table), so the underlying media in
// Uploadcare is untouched — only the grouping disappears.
//
// If you're on Next.js 13/14 (sync route params instead of the
// Next 15 async/Promise params used below), change the signature to:
//   { params }: { params: { id: string } }
// and drop the `await` on the next line.
// -----------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    const deleted = await db
      .delete(mediaSetSchema)
      .where(and(eq(mediaSetSchema.id, id), eq(mediaSetSchema.orgId, orgId!)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Set not found.' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    console.error('[MediaLibrary/Sets] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete set.' }, { status: 500 });
  }
}
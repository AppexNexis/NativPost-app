/**
 * src/app/api/admin/support/kb/[id]/route.ts
 *
 * GET    → single article
 * PATCH  → update article
 * DELETE → delete article
 */

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import { knowledgeArticleSchema } from '@/models/Schema';

type RouteContext = { params: Promise<{ id: string }> };

function isNativPostStaff(orgId?: string | null, orgRole?: string | null): boolean {
  const teamOrgId = process.env.NATIVPOST_TEAM_ORG_ID;
  if (!teamOrgId) return false;
  return orgId === teamOrgId && orgRole === 'org:admin';
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !isNativPostStaff(orgId, orgRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDb();
  const [article] = await db
    .select()
    .from(knowledgeArticleSchema)
    .where(eq(knowledgeArticleSchema.id, id));

  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ article });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !isNativPostStaff(orgId, orgRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const db = await getDb();

  const updates: Partial<typeof knowledgeArticleSchema.$inferInsert> = {};
  if (body.title !== undefined)       updates.title = body.title;
  if (body.body !== undefined)        updates.body = body.body;
  if (body.excerpt !== undefined)     updates.excerpt = body.excerpt;
  if (body.category !== undefined)    updates.category = body.category;
  if (body.tags !== undefined)        updates.tags = body.tags;
  if (body.isPublished !== undefined) updates.isPublished = body.isPublished;
  if (body.isInternal !== undefined)  updates.isInternal = body.isInternal;

  const [updated] = await db
    .update(knowledgeArticleSchema)
    .set(updates)
    .where(eq(knowledgeArticleSchema.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ article: updated });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !isNativPostStaff(orgId, orgRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDb();
  await db.delete(knowledgeArticleSchema).where(eq(knowledgeArticleSchema.id, id));
  return NextResponse.json({ deleted: true });
}
/**
 * src/app/api/admin/support/kb/route.ts
 *
 * GET  → list all knowledge base articles
 * POST → create a new article
 */

import { auth } from '@clerk/nextjs/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import { knowledgeArticleSchema } from '@/models/Schema';

function isNativPostStaff(
  orgId: string | null | undefined,
  orgRole: string | null | undefined,
): boolean {
  const teamOrgId = process.env.NATIVPOST_TEAM_ORG_ID;
  if (!teamOrgId) return false;
  return orgId === teamOrgId && orgRole === 'org:admin';
}

export async function GET(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !isNativPostStaff(orgId, orgRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const category   = searchParams.get('category');
  const isInternal = searchParams.get('internal');
  const search     = searchParams.get('search')?.toLowerCase();

  const db = await getDb();
  const conditions = [];

  if (category) conditions.push(eq(knowledgeArticleSchema.category, category));
  if (isInternal === 'true') conditions.push(eq(knowledgeArticleSchema.isInternal, true));
  if (isInternal === 'false') conditions.push(eq(knowledgeArticleSchema.isInternal, false));

  const articles = await db
    .select()
    .from(knowledgeArticleSchema)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(knowledgeArticleSchema.updatedAt));

  // Client-side search filter (simpler than SQL ILIKE for small datasets)
  const filtered = search
    ? articles.filter(
        (a) =>
          a.title.toLowerCase().includes(search)
          || a.excerpt?.toLowerCase().includes(search)
          || a.body.toLowerCase().includes(search),
      )
    : articles;

  // Category breakdown for sidebar
  const categoryStats = await db
    .select({
      category: knowledgeArticleSchema.category,
      count:    sql<number>`count(*)`,
    })
    .from(knowledgeArticleSchema)
    .groupBy(knowledgeArticleSchema.category);

  return NextResponse.json({ articles: filtered, categoryStats });
}

export async function POST(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !isNativPostStaff(orgId, orgRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    title: string;
    body: string;
    excerpt?: string;
    category: string;
    tags?: string[];
    isPublished?: boolean;
    isInternal?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.title?.trim() || !body.body?.trim() || !body.category) {
    return NextResponse.json({ error: 'Title, body and category are required' }, { status: 400 });
  }

  const slug = body.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);

  const db = await getDb();

  const [article] = await db
    .insert(knowledgeArticleSchema)
    .values({
      title:       body.title.trim(),
      slug:        `${slug}-${Date.now()}`,
      body:        body.body.trim(),
      excerpt:     body.excerpt?.trim() ?? body.body.trim().slice(0, 160),
      category:    body.category,
      tags:        body.tags ?? [],
      isPublished: body.isPublished ?? true,
      isInternal:  body.isInternal ?? false,
      authorUserId: userId,
    })
    .returning();

  return NextResponse.json({ article }, { status: 201 });
}
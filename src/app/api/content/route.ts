import { clerkClient } from '@clerk/nextjs/server';
import { and, asc, desc, eq, gt, ilike, inArray, lt, ne, or, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { serializeContent } from '@/lib/api-v1';
import { getAuthContext } from '@/lib/auth';
import { sendApprovalNotification } from '@/lib/email';
import { fireWebhook } from '@/lib/webhook-dispatcher';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { contentItemSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/content
// List content items for the current org (with optional filters).
//
// Query params (all optional):
//   status         — single status filter (draft/pending_review/approved/…)
//   search         — case-insensitive substring on caption
//   contentType    — comma-separated list (slideshow,ugc,talking_head,…)
//   platform       — comma-separated list (instagram,tiktok,…)
//                    matches rows whose targetPlatforms JSON array contains
//                    ANY of the listed platforms
//   sort           — newest (default) | oldest | scheduled | quality
//   cursor         — ISO createdAt of the last item on the prior page
//   limit          — page size, capped at 100 (default 50)
//
// Response: { items, counts, nextCursor }
//   counts is computed server-side across the entire org (respecting the
//   same search/type/platform filters but ignoring status), so tab pills
//   stay accurate as the user paginates.
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const contentTypeParam = searchParams.get('contentType');
  const platformParam = searchParams.get('platform');
  const sort = searchParams.get('sort') || 'newest';
  const cursor = searchParams.get('cursor');
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);

  // Filters shared between the item query and the counts query. Status is
  // NOT included here — counts must reflect every bucket regardless of the
  // currently active tab.
  const sharedConditions = [eq(contentItemSchema.orgId, orgId!)];

  // Archived rows are cleanup byproducts; hide by default unless the
  // caller explicitly asked for status=archived.
  if (status !== 'archived') {
    sharedConditions.push(ne(contentItemSchema.status, 'archived'));
  }

  if (search && search.trim()) {
    sharedConditions.push(ilike(contentItemSchema.caption, `%${search.trim()}%`));
  }

  const contentTypes = contentTypeParam
    ? contentTypeParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  if (contentTypes.length > 0) {
    sharedConditions.push(inArray(contentItemSchema.contentType, contentTypes));
  }

  const platforms = platformParam
    ? platformParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  if (platforms.length > 0) {
    // targetPlatforms is a JSONB array; use ?| operator to match any of
    // the requested platforms. Wrapped in sql`` so drizzle keeps the
    // literal operator intact.
    sharedConditions.push(
      sql`${contentItemSchema.targetPlatforms} ?| ${platforms}`,
    );
  }

  try {
    // ── Items query ──────────────────────────────────────────────────────
    const itemConditions = [...sharedConditions];
    if (status) {
      itemConditions.push(eq(contentItemSchema.status, status));
    }

    // Cursor is a base64-encoded JSON blob shaped by the active sort. This
    // keeps pagination correct across every sort mode — the previous "always
    // filter createdAt < cursor" was only correct for the default `newest`
    // sort and silently broke oldest/scheduled/quality (verifier caught it).
    //
    // Shape per sort:
    //   newest    → { ca: ISO }                filter: createdAt < ca
    //   oldest    → { ca: ISO }                filter: createdAt > ca
    //   scheduled → { sf: ISO|null, ca: ISO }  filter: (sf > cur.sf) OR (sf == cur.sf AND ca > cur.ca), nulls sort last
    //   quality   → { q: num|null,  ca: ISO }  filter: (q < cur.q) OR (q == cur.q AND ca < cur.ca), nulls sort last
    //
    // Backward-compat: if cursor decodes as a plain ISO date string (older
    // clients from before this rewrite), treat as { ca: <that date> } under
    // the current sort so the page still loads instead of 500-ing.
    type CursorPayload = { ca?: string; sf?: string | null; q?: number | null };
    let cursorPayload: CursorPayload | null = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed === 'object') cursorPayload = parsed;
      } catch {
        // Legacy plain-ISO fallback.
        const d = new Date(cursor);
        if (!Number.isNaN(d.getTime())) cursorPayload = { ca: d.toISOString() };
      }
    }

    let orderBy: ReturnType<typeof asc> | ReturnType<typeof desc> | ReturnType<typeof sql> | any;
    switch (sort) {
      case 'oldest':
        orderBy = asc(contentItemSchema.createdAt);
        if (cursorPayload?.ca) {
          const d = new Date(cursorPayload.ca);
          if (!Number.isNaN(d.getTime())) {
            itemConditions.push(gt(contentItemSchema.createdAt, d));
          }
        }
        break;
      case 'scheduled': {
        // ORDER BY scheduledFor ASC NULLS LAST, createdAt DESC (tiebreaker).
        orderBy = sql`${contentItemSchema.scheduledFor} ASC NULLS LAST, ${contentItemSchema.createdAt} DESC`;
        if (cursorPayload) {
          const sfRaw = cursorPayload.sf;
          const caRaw = cursorPayload.ca;
          const sfDate = sfRaw ? new Date(sfRaw) : null;
          const caDate = caRaw ? new Date(caRaw) : null;
          if (sfDate && !Number.isNaN(sfDate.getTime()) && caDate && !Number.isNaN(caDate.getTime())) {
            // Non-null cursor: (sf > cur.sf) OR (sf == cur.sf AND ca < cur.ca) OR (sf IS NULL)
            const cond = or(
              sql`${contentItemSchema.scheduledFor} > ${sfDate}`,
              and(
                sql`${contentItemSchema.scheduledFor} = ${sfDate}`,
                lt(contentItemSchema.createdAt, caDate),
              ),
              sql`${contentItemSchema.scheduledFor} IS NULL`,
            );
            if (cond) itemConditions.push(cond);
          } else if (caDate && !Number.isNaN(caDate.getTime())) {
            // Cursor is in the NULLS-LAST tail (sf is null): only createdAt < ca left.
            itemConditions.push(
              and(
                sql`${contentItemSchema.scheduledFor} IS NULL`,
                lt(contentItemSchema.createdAt, caDate),
              )!,
            );
          }
        }
        break;
      }
      case 'quality': {
        orderBy = sql`${contentItemSchema.antiSlopScore} DESC NULLS LAST, ${contentItemSchema.createdAt} DESC`;
        if (cursorPayload) {
          const qRaw = cursorPayload.q;
          const caRaw = cursorPayload.ca;
          const caDate = caRaw ? new Date(caRaw) : null;
          if (typeof qRaw === 'number' && caDate && !Number.isNaN(caDate.getTime())) {
            const cond = or(
              sql`${contentItemSchema.antiSlopScore} < ${qRaw}`,
              and(
                sql`${contentItemSchema.antiSlopScore} = ${qRaw}`,
                lt(contentItemSchema.createdAt, caDate),
              ),
              sql`${contentItemSchema.antiSlopScore} IS NULL`,
            );
            if (cond) itemConditions.push(cond);
          } else if (caDate && !Number.isNaN(caDate.getTime())) {
            itemConditions.push(
              and(
                sql`${contentItemSchema.antiSlopScore} IS NULL`,
                lt(contentItemSchema.createdAt, caDate),
              )!,
            );
          }
        }
        break;
      }
      case 'newest':
      default:
        orderBy = desc(contentItemSchema.createdAt);
        if (cursorPayload?.ca) {
          const d = new Date(cursorPayload.ca);
          if (!Number.isNaN(d.getTime())) {
            itemConditions.push(lt(contentItemSchema.createdAt, d));
          }
        }
        break;
    }

    const items = await db
      .select()
      .from(contentItemSchema)
      .where(and(...itemConditions))
      .orderBy(orderBy)
      .limit(limit + 1); // fetch one extra to know if there's a next page

    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const lastItem = pageItems[pageItems.length - 1];

    // Build the next cursor payload matching the active sort so subsequent
    // calls know exactly where to resume.
    let nextCursor: string | null = null;
    if (hasMore && lastItem) {
      let payload: CursorPayload | null = null;
      const caIso = lastItem.createdAt.toISOString();
      switch (sort) {
        case 'oldest':
        case 'newest':
        default:
          payload = { ca: caIso };
          break;
        case 'scheduled':
          payload = {
            sf: lastItem.scheduledFor ? lastItem.scheduledFor.toISOString() : null,
            ca: caIso,
          };
          break;
        case 'quality':
          payload = {
            q: lastItem.antiSlopScore ?? null,
            ca: caIso,
          };
          break;
      }
      nextCursor = payload ? Buffer.from(JSON.stringify(payload)).toString('base64') : null;
    }

    // ── Counts query ─────────────────────────────────────────────────────
    // One query, grouped by status. Filters (search/type/platform) apply
    // but status does not — we want the full breakdown so tab pills always
    // reflect the caller's filtered view.
    const countsRows = await db
      .select({
        status: contentItemSchema.status,
        n: sql<number>`count(*)::int`,
      })
      .from(contentItemSchema)
      .where(and(...sharedConditions))
      .groupBy(contentItemSchema.status);

    const counts: Record<string, number> = {
      draft: 0,
      pending_review: 0,
      approved: 0,
      scheduled: 0,
      published: 0,
      rejected: 0,
      total: 0,
    };
    for (const row of countsRows) {
      const key = row.status ?? 'draft';
      counts[key] = Number(row.n);
      counts.total = (counts.total ?? 0) + Number(row.n);
    }

    return NextResponse.json(
      { items: pageItems, counts, nextCursor },
      { status: 200 },
    );
  } catch (err) {
    console.error('Failed to fetch content items:', err);
    return NextResponse.json(
      { error: 'Failed to fetch content items' },
      { status: 500 },
    );
  }
}

// -----------------------------------------------------------
// POST /api/content
// Create a new content item (manual or engine-generated)
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();

    const [created] = await db
      .insert(contentItemSchema)
      .values({
        orgId: orgId!,
        brandProfileId: body.brandProfileId || null,
        caption: String(body.caption || ''),
        hashtags: Array.isArray(body.hashtags) ? body.hashtags : [],
        contentType: String(body.contentType || 'single_image'),
        topic: body.topic ? String(body.topic) : null,
        graphicUrls: Array.isArray(body.graphicUrls) ? body.graphicUrls : [],
        graphicTemplateId: body.graphicTemplateId || null,
        variantGroupId: body.variantGroupId || null,
        variantNumber: Number(body.variantNumber) || 1,
        isSelectedVariant: Boolean(body.isSelectedVariant),
        targetPlatforms: Array.isArray(body.targetPlatforms) ? body.targetPlatforms : [],
        platformSpecific: body.platformSpecific || {},
        status: body.status || 'draft',
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
        antiSlopScore: body.antiSlopScore ? Number(body.antiSlopScore) : null,
        qualityFlags: Array.isArray(body.qualityFlags) ? body.qualityFlags : [],
        aspectRatio: body.aspectRatio || null,
        contentMode: body.contentMode || 'normal',
        enrichmentData: body.enrichmentData && typeof body.enrichmentData === 'object' ? body.enrichmentData : {},
        enrichmentApplied: Array.isArray(body.enrichmentApplied) ? body.enrichmentApplied : [],
      })
      .returning();

    // Emit content.created webhook (fire-and-forget via waitUntil)
    if (created) {
      fireWebhook(orgId!, 'content.created', {
        content: serializeContent(created),
      });
    }

    // Send approval notification (non-blocking — never delays the response)
    try {
      const clerk = await clerkClient();
      const [user, org] = await Promise.all([
        clerk.users.getUser(userId!),
        clerk.organizations.getOrganization({ organizationId: orgId! }),
      ]);
      const userEmail = user.emailAddresses[0]?.emailAddress;
      const orgName = org.name || orgId!;
      if (userEmail) {
        sendApprovalNotification(userEmail, orgName, 1)
          .catch(err => console.error('[Email] sendApprovalNotification failed:', err));
      }
    } catch (emailErr) {
      console.error('[Email] Failed to send creation notification:', emailErr);
    }

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create content item:', err);
    return NextResponse.json(
      { error: 'Failed to create content item' },
      { status: 500 },
    );
  }
}

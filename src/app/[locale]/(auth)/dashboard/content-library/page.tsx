import { desc, eq, and } from 'drizzle-orm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ContentLibraryPage } from '@/components/content-library/ContentLibraryPage';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';
import type { ContentTemplate } from '@/types/v2';

export const metadata: Metadata = {
  title: 'Content Library | NativPost',
  description: 'Browse and remix trending short-form content',
};

export default async function ContentLibrary() {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();

  if (error || !orgId) {
    redirect('/sign-in');
  }

  const items = await db
    .select()
    .from(contentTemplateSchema)
    .where(
      and(
        eq(contentTemplateSchema.curationStatus, 'approved'),
        eq(contentTemplateSchema.isActive, true),
      ),
    )
    .orderBy(desc(contentTemplateSchema.engagementScore))
    .limit(100);

  // Ensure timestamps are serialised as strings for the client.
  const templates: ContentTemplate[] = items.map((item) => ({
    ...item,
    niches: (item.niches ?? []) as ContentTemplate['niches'],
    angles: (item.angles ?? []) as string[],
    structure: (item.structure ?? {}) as ContentTemplate['structure'],
    thumbnailUrls: (item.thumbnailUrls ?? {}) as Record<string, string>,
    addedAt: item.addedAt?.toISOString() ?? new Date().toISOString(),
    curatedAt: item.curatedAt?.toISOString() ?? null,
    lastRefreshedAt: item.lastRefreshedAt?.toISOString() ?? null,
    updatedAt: item.updatedAt?.toISOString() ?? new Date().toISOString(),
    createdAt: item.createdAt?.toISOString() ?? new Date().toISOString(),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ContentLibraryPage templates={templates} bookmarkedIds={new Set()} />
      </div>
    </div>
  );
}

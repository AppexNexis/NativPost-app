import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { CampaignCalendar } from '@/components/campaigns/CampaignCalendar';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';

export const metadata: Metadata = {
  title: 'Campaign Calendar | NativPost',
  description: 'Scheduled posts across your campaign timeline',
};

type PageProps = { params: Promise<{ id: string; locale: string }> };

export default async function Page({ params }: PageProps) {
  const { id, locale } = await params;
  const db = await getDb();
  const { error, orgId } = await getAuthContext();

  if (error || !orgId) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        Please sign in to view this campaign.
      </p>
    );
  }

  const [campaign] = await db
    .select()
    .from(campaignSchema)
    .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId)))
    .limit(1);

  if (!campaign) {
    notFound();
  }

  return (
    <CampaignCalendar
      campaign={campaign as any}
      locale={locale}
    />
  );
}

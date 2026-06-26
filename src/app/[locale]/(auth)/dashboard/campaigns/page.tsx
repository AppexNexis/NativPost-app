import type { Metadata } from 'next';
import { CampaignsPage } from '@/components/campaigns/CampaignsPage';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, campaignSchema, contentAngleSchema, socialAccountSchema } from '@/models/Schema';
import { eq, and, desc } from 'drizzle-orm';

export const metadata: Metadata = {
  title: 'Campaigns | NativPost',
  description: 'Create and manage automated content campaigns',
};

export default async function Page() {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();

  // If auth fails, render empty state (middleware should catch this, but be safe)
  if (error || !orgId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-sm text-gray-500">Please sign in to view campaigns.</p>
        </div>
      </div>
    );
  }

  const [campaigns, angles, accounts, influencers] = await Promise.all([
    db
      .select()
      .from(campaignSchema)
      .where(eq(campaignSchema.orgId, orgId))
      .orderBy(desc(campaignSchema.createdAt)),
    db
      .select()
      .from(contentAngleSchema)
      .where(
        and(
          eq(contentAngleSchema.isActive, true),
        ),
      )
      .orderBy(contentAngleSchema.name)
      .then((items) => items.filter((item) => item.isSystem || item.orgId === orgId)),
    db
      .select()
      .from(socialAccountSchema)
      .where(and(eq(socialAccountSchema.orgId, orgId), eq(socialAccountSchema.isActive, true)))
      .orderBy(socialAccountSchema.platform),
    db
      .select({ id: aiInfluencerSchema.id, name: aiInfluencerSchema.name })
      .from(aiInfluencerSchema)
      .where(eq(aiInfluencerSchema.orgId, orgId))
      .orderBy(aiInfluencerSchema.name),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <CampaignsPage
          campaigns={campaigns as any}
          angles={angles as any}
          accounts={accounts as any}
          influencers={influencers as any}
        />
      </div>
    </div>
  );
}

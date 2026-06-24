import type { Metadata } from 'next';
import { CampaignsPage } from '@/components/campaigns/CampaignsPage';
import type { Campaign, ContentAngle } from '@/types/v2';

export const metadata: Metadata = {
  title: 'Campaigns | NativPost',
  description: 'Create and manage automated content campaigns',
};

const MOCK_ANGLES: ContentAngle[] = [
  { id: '1', orgId: null, name: 'Time vs Growth Tradeoff', description: 'The tension between time spent on content vs business growth', color: '#F97316', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
  { id: '2', orgId: null, name: 'Content Consistency Struggle', description: 'The challenge of maintaining consistent posting', color: '#3B82F6', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
  { id: '3', orgId: null, name: 'Generic Content Fatigue', description: 'Avoiding cookie-cutter content', color: '#8B5CF6', isSystem: true, isActive: true, createdAt: new Date().toISOString() },
];

const MOCK_ACCOUNTS: any[] = [
  { id: '1', platform: 'youtube', platformUsername: 'NativPost', isActive: true },
  { id: '2', platform: 'instagram', platformUsername: 'nativpost', isActive: true },
];

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: '1',
    orgId: 'org-1',
    name: 'June Growth Push',
    description: '3-week campaign focused on time vs growth tradeoff',
    status: 'active',
    contentMix: { slideshow: 30, wallOfText: 20, greenScreen: 30, videoHook: 20 },
    remixRatio: 50,
    angles: [{ angleId: '1', weight: 40 }, { angleId: '2', weight: 35 }, { angleId: '3', weight: 25 }],
    mentionFrequency: 'sometimes',
    genderPreference: null,
    ownMediaMix: 50,
    influencerFrequency: 0,
    targetAccounts: [{ accountId: '1', platform: 'youtube' }],
    postsPerDay: 3,
    campaignLengthDays: 7,
    startDate: new Date().toISOString(),
    totalPosts: 21,
    generatedPosts: 21,
    reRollsRemaining: 2,
    qualityThreshold: 0.7,
    totalEngagement: 0,
    avgEngagementRate: null,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

export default function Page() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <CampaignsPage
          campaigns={MOCK_CAMPAIGNS}
          angles={MOCK_ANGLES}
          accounts={MOCK_ACCOUNTS}
          influencers={[]}
        />
      </div>
    </div>
  );
}

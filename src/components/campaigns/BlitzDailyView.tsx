"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, RefreshCw, Sparkles, Settings2 } from 'lucide-react';
import type { Campaign, ContentItem } from '@/types/v2';
import { CampaignReviewGrid } from './CampaignReviewGrid';
import { BlitzSettings } from '@/components/blitz/BlitzSettings';

interface BlitzDailyViewProps {
  campaign: Campaign;
  initialContentItems: (ContentItem & {
    sequenceIndex?: number;
    scheduledDate?: string;
    scheduledTime?: string;
    isRolled?: boolean;
    angleName?: string | null;
  })[];
}

export function BlitzDailyView({ campaign, initialContentItems }: BlitzDailyViewProps) {
  const router = useRouter();
  const [contentItems, setContentItems] = useState(initialContentItems);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refresh = async () => {
    const res = await fetch(`/api/campaigns/${campaign.id}`);
    if (!res.ok) return;
    const data = await res.json();
    const loaded = (data.contentItems || []).map((cc: any) => ({
      ...(cc.contentItem || {}),
      angleName: cc.contentItem?.angleName || null,
      sequenceIndex: cc.sequenceIndex,
      scheduledDate: cc.scheduledDate ? new Date(cc.scheduledDate).toISOString().slice(0, 10) : undefined,
      scheduledTime: cc.scheduledTime,
      isRolled: cc.isRolled,
    }));
    setContentItems(loaded);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate Blitz');
      }
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLaunch = async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to launch Blitz');
      }
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Launch failed');
    }
  };

  const handleEdit = (itemId: string) => {
    router.push(`/dashboard/content/${itemId}/edit`);
  };

  const handleReRoll = async (itemId: string) => {
    const res = await fetch(`/api/campaigns/${campaign.id}/re-roll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentItemId: itemId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Re-roll failed');
      return;
    }
    await refresh();
  };

  const handleDelete = async (itemId: string) => {
    const res = await fetch(`/api/content/${itemId}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Delete failed');
      return;
    }
    setContentItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleApprove = async (itemId: string) => {
    const res = await fetch(`/api/content/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    if (!res.ok) {
      setError('Approve failed');
      return;
    }
    const data = await res.json();
    setContentItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...data.item } : i)));
  };

  const handleSkip = async (itemId: string) => {
    const res = await fetch(`/api/content/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'skipped' }),
    });
    if (!res.ok) {
      setError('Skip failed');
      return;
    }
    setContentItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleScheduleChange = async (itemId: string, date: string, time: string) => {
    const res = await fetch(`/api/campaigns/${campaign.id}/content/${itemId}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledDate: date, scheduledTime: time }),
    });
    if (!res.ok) {
      setError('Schedule update failed');
      return;
    }
    setContentItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, scheduledDate: date, scheduledTime: time } : i))
    );
  };

  const hasContent = contentItems.length > 0;
  const approvedCount = contentItems.filter((i) => i.status === 'approved').length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-orange-500" />
            <h1 className="text-2xl font-bold text-gray-900">Blitz</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Your daily content queue. Generate, approve, and schedule posts for today.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Settings2 className="h-4 w-4" />
            Settings
          </button>
          {hasContent && (
            <button
              onClick={handleLaunch}
              disabled={approvedCount === 0}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              Launch {approvedCount} approved
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
            {isGenerating ? 'Generating...' : hasContent ? 'Regenerate' : "Generate today's Blitz"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!hasContent && !isGenerating ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
            <Zap className="h-8 w-8 text-orange-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">No posts yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Generate your daily Blitz queue to get AI-powered post ideas tailored to your brand.
          </p>
          <button
            onClick={handleGenerate}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700"
          >
            <Sparkles className="h-4 w-4" />
            Generate today's Blitz
          </button>
        </div>
      ) : (
        <CampaignReviewGrid
          campaign={campaign}
          contentItems={contentItems}
          onEdit={handleEdit}
          onReRoll={handleReRoll}
          onDelete={handleDelete}
          onApprove={handleApprove}
          onSkip={handleSkip}
          onScheduleChange={handleScheduleChange}
        />
      )}

      <BlitzSettings
        campaignId={campaign.id}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => { refresh(); }}
        initial={{
          contentMix: (campaign.contentMix ?? {}) as Record<string, number>,
          remixRatio: campaign.remixRatio ?? 50,
          angles: (campaign.angles ?? []) as { angleId: string; weight: number }[],
          mentionFrequency: campaign.mentionFrequency ?? 'sometimes',
          ownMediaMix: campaign.ownMediaMix ?? 50,
          pinterestPercent: (campaign as any).pinterestPercent ?? 0,
          influencerFrequency: campaign.influencerFrequency ?? 0,
          enabledInfluencerIds: ((campaign as any).enabledInfluencerIds ?? []) as string[],
          targetAccounts: (campaign.targetAccounts ?? []) as { accountId: string; platform: string }[],
          genderPreference: campaign.genderPreference ?? 'any',
          postsPerDay: campaign.postsPerDay ?? 3,
          qualityThreshold: campaign.qualityThreshold ?? 0.7,
        }}
      />
    </div>
  );
}

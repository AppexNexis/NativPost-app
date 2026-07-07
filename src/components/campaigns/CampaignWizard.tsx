'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Sparkles, Check } from 'lucide-react';
import type { Campaign, ContentAngle, CampaignAngle, ContentMix, TargetAccount, ContentItem } from '@/types/v2';
import type { SocialAccount } from '@/types/v2';
import { CampaignReviewGrid } from './CampaignReviewGrid';

interface CampaignWizardProps {
  angles: ContentAngle[];
  accounts: SocialAccount[];
  influencers: { id: string; name: string }[];
  onCreate: (campaign: Partial<Campaign>) => Promise<Campaign | null>;
  onGenerate: (campaignId: string) => Promise<void>;
  onLaunch: (campaignId: string) => Promise<void>;
  isLoading?: boolean;
}

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'angles', label: 'Angles' },
  { id: 'voice', label: 'Voice' },
  { id: 'sources', label: 'Sources' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'cadence', label: 'Cadence' },
  { id: 'generate', label: 'Generate' },
  { id: 'review', label: 'Review' },
  { id: 'launch', label: 'Launch' },
];

export function CampaignWizard({
  angles,
  accounts,
  influencers,
  onCreate,
  onGenerate,
  onLaunch,
  isLoading,
}: CampaignWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [campaign, setCampaign] = useState<Partial<Campaign>>({
    name: '',
    description: '',
    contentMix: {
      slideshow: 25,
      wallOfText: 25,
      greenScreen: 25,
      videoHook: 25,
    },
    remixRatio: 50,
    angles: [],
    mentionFrequency: 'sometimes',
    genderPreference: null,
    ownMediaMix: 50,
    influencerFrequency: 0,
    targetAccounts: [],
    postsPerDay: 3,
    campaignLengthDays: 7,
    startDate: null,
    totalPosts: 0,
    qualityThreshold: 0.7,
    reRollsRemaining: 4,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCampaignId, setGeneratedCampaignId] = useState<string | null>(null);
  const [contentItems, setContentItems] = useState<(ContentItem & { sequenceIndex?: number; scheduledDate?: string; scheduledTime?: string; isRolled?: boolean })[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const totalSteps = STEPS.length;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const updateCampaign = useCallback((updates: Partial<Campaign>) => {
    setCampaign((prev) => ({ ...prev, ...updates }));
  }, []);

  const fetchCampaignItems = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) throw new Error('Failed to fetch campaign items');
      const data = await res.json();
      const loaded = (data.contentItems || []).map((cc: any) => ({
        ...(cc.contentItem || {}),
        sequenceIndex: cc.sequenceIndex,
        scheduledDate: cc.scheduledDate ? new Date(cc.scheduledDate).toISOString().slice(0, 10) : undefined,
        scheduledTime: cc.scheduledTime,
        isRolled: cc.isRolled,
      }));
      setContentItems(loaded);
    } catch (err: any) {
      setReviewError(err.message || 'Failed to load generated posts');
    }
  };

  const refreshCampaign = async (campaignId: string) => {
    await fetchCampaignItems(campaignId);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setReviewError(null);
    try {
      const created = await onCreate(campaign);
      if (created?.id) {
        setGeneratedCampaignId(created.id);
        await onGenerate(created.id);
        await fetchCampaignItems(created.id);
        setCurrentStep(7);
      }
    } catch (err: any) {
      setReviewError(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 6) {
      handleGenerate();
      return;
    }
    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleLaunch = async () => {
    if (generatedCampaignId) {
      await onLaunch(generatedCampaignId);
      setCurrentStep(8);
    }
  };

  const handleEdit = (itemId: string) => {
    router.push(`/dashboard/content/${itemId}/edit`);
  };

  const handleReRoll = async (itemId: string) => {
    if (!generatedCampaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${generatedCampaignId}/re-roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentItemId: itemId, keepText: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Re-roll failed');
      }
      await refreshCampaign(generatedCampaignId);
    } catch (err: any) {
      setReviewError(err.message || 'Re-roll failed');
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      const res = await fetch(`/api/content/${itemId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setContentItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err: any) {
      setReviewError(err.message || 'Delete failed');
    }
  };

  const handleApprove = async (itemId: string) => {
    try {
      const res = await fetch(`/api/content/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      if (!res.ok) throw new Error('Approve failed');
      const data = await res.json();
      setContentItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, ...data.item } : i))
      );
    } catch (err: any) {
      setReviewError(err.message || 'Approve failed');
    }
  };

  const handleScheduleChange = async (itemId: string, date: string, time: string) => {
    if (!generatedCampaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${generatedCampaignId}/content/${itemId}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: date, scheduledTime: time }),
      });
      if (!res.ok) throw new Error('Schedule update failed');
      setContentItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, scheduledDate: date, scheduledTime: time } : i))
      );
    } catch (err: any) {
      setReviewError(err.message || 'Schedule update failed');
    }
  };

  const renderStep = () => {
    const props = {
      campaign,
      angles,
      accounts,
      influencers,
      isLoading: isLoading ?? false,
      onUpdate: updateCampaign,
    };

    switch (currentStep) {
      case 7:
        return (
          <StepReview
            {...props}
            contentItems={contentItems}
            reviewError={reviewError}
            onEdit={handleEdit}
            onReRoll={handleReRoll}
            onDelete={handleDelete}
            onApprove={handleApprove}
            onScheduleChange={handleScheduleChange}
          />
        );
      default: {
        const StepComponent = STEP_COMPONENTS[currentStep];
        return StepComponent ? <StepComponent {...props} /> : null;
      }
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-900">{STEPS[currentStep]?.label ?? ''}</span>
          <span className="text-sm text-gray-500">
            {currentStep + 1} / {totalSteps}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="p-8">
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-8 py-4">
          <button
            onClick={handleBack}
            disabled={currentStep === 0 || isGenerating || isLoading}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {currentStep === 7 ? (
            <button
              onClick={handleLaunch}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              Continue to launch
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : currentStep === 6 ? (
            <button
              onClick={handleNext}
              disabled={isGenerating || isLoading}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Sparkles className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate {calculateTotalPosts(campaign)} posts
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          ) : currentStep === 8 ? null : (
            <button
              onClick={handleNext}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Shared step props interface
// ============================================================

interface StepProps {
  campaign: Partial<Campaign>;
  angles: ContentAngle[];
  accounts: SocialAccount[];
  influencers: { id: string; name: string }[];
  isLoading: boolean;
  onUpdate: (u: Partial<Campaign>) => void;
}

// ============================================================
// STEP 1: BASICS
// ============================================================
function StepBasics({ campaign, onUpdate }: StepProps) {
  const mix = campaign.contentMix ?? {};
  const totalMix = Object.values(mix).reduce<number>((a, b) => a + (b ?? 0), 0);

  const handleMixChange = (key: keyof ContentMix, delta: number) => {
    const current = (mix[key] ?? 0) + delta;
    if (current < 0 || current > 100) return;
    onUpdate({ contentMix: { ...mix, [key]: current } });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">What's this campaign about?</h3>
        <p className="text-sm text-gray-500">
          Name your campaign and set the content mix. We'll use your brand context to generate every post.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Name (optional)
        </label>
        <input
          type="text"
          placeholder="23rd June 2026 Campaign"
          value={campaign.name ?? ''}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Content Mix</label>
          <span className="text-sm font-medium text-gray-900">{totalMix}%</span>
        </div>
        <div className="mt-3 space-y-3">
          {(
            [
              ['slideshow', 'Slideshow', 'bg-yellow-400'],
              ['wallOfText', 'Wall of text', 'bg-blue-500'],
              ['greenScreen', 'Green screen', 'bg-green-500'],
              ['videoHook', 'Video hook', 'bg-purple-400'],
            ] as [keyof ContentMix, string, string][]
          ).map(([key, label, color]) => (
            <div key={key} className="flex items-center gap-4">
              <div className={`h-3 w-3 rounded-full ${color}`} />
              <span className="flex-1 text-sm text-gray-700">{label}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleMixChange(key, -5)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                >
                  -
                </button>
                <span className="w-10 text-center text-sm font-medium">{mix[key] ?? 0}%</span>
                <button
                  onClick={() => handleMixChange(key, 5)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Remix Ratio</label>
          <span className="text-sm font-medium text-gray-900">{campaign.remixRatio}%</span>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          How much we remix trending content vs. create original ideas from scratch. Slide right for more remix.
        </p>
        <input
          type="range"
          min={0}
          max={100}
          value={campaign.remixRatio ?? 50}
          onChange={(e) => onUpdate({ remixRatio: parseInt(e.target.value) })}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-primary"
        />
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>Original</span>
          <span>Remix</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 2: ANGLES
// ============================================================
function StepAngles({ campaign, angles, onUpdate }: StepProps) {
  const campaignAngles = (campaign.angles ?? []) as CampaignAngle[];
  const totalWeight = campaignAngles.reduce((sum, a) => sum + (a.weight ?? 0), 0);

  const handleWeightChange = (angleId: string, weight: number) => {
    const exists = campaignAngles.find((a) => a.angleId === angleId);
    const updated = exists
      ? campaignAngles.map((a) => (a.angleId === angleId ? { ...a, weight } : a))
      : [...campaignAngles, { angleId, weight }];
    onUpdate({ angles: updated });
  };

  const equalize = () => {
    const count = angles.length;
    if (count === 0) return;
    const weight = Math.floor(100 / count);
    const remainder = 100 - weight * count;
    const updated = angles.map((angle, i) => ({
      angleId: angle.id,
      weight: weight + (i < remainder ? 1 : 0),
    }));
    onUpdate({ angles: updated });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">How should we balance your angles?</h3>
        <p className="text-sm text-gray-500">
          Set how often each content angle appears across the campaign. Weights are a guide — we spread posts across your angles accordingly.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Angle Distribution</span>
        <div className="flex items-center gap-2">
          <button onClick={equalize} className="text-xs font-medium text-primary hover:text-primary/80">
            Equalize
          </button>
          <span className={`text-sm font-medium ${totalWeight === 100 ? 'text-green-600' : 'text-gray-900'}`}>
            {totalWeight}/100
          </span>
        </div>
      </div>

      {angles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No content angles configured yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {angles.map((angle) => {
            const campaignAngle = campaignAngles.find((a) => a.angleId === angle.id);
            const weight = campaignAngle?.weight ?? 0;
            return (
              <div key={angle.id} className="flex items-center gap-4">
                <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: angle.color ?? '#ccc' }} />
                <span className="flex-1 truncate text-sm text-gray-700">{angle.name}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={weight}
                  onChange={(e) => handleWeightChange(angle.id, parseInt(e.target.value))}
                  className="w-48 accent-primary"
                />
                <span className="w-10 text-right text-sm font-medium">{weight}%</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// STEP 3: VOICE
// ============================================================
function StepVoice({ campaign, onUpdate }: StepProps) {
  const frequencies: { value: string; label: string }[] = [
    { value: 'never', label: 'Never' },
    { value: 'rarely', label: 'Rarely' },
    { value: 'sometimes', label: 'Sometimes' },
    { value: 'often', label: 'Often' },
    { value: 'always', label: 'Always' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Set the voice of your campaign</h3>
        <p className="text-sm text-gray-500">
          Choose how often we mention your business, and optionally narrow the platform videos we draw from.
        </p>
      </div>

      <div>
        <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Mention My Business
        </label>
        <p className="mb-3 text-sm text-gray-400">How often to weave your product into the generated posts.</p>
        <div className="flex gap-2">
          {frequencies.map((freq) => (
            <button
              key={freq.value}
              onClick={() => onUpdate({ mentionFrequency: freq.value as Campaign['mentionFrequency'] })}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${campaign.mentionFrequency === freq.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
            >
              {freq.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Gender Preference
        </label>
        <p className="mb-3 text-sm text-gray-400">Filter platform videos by gender. No selection shows all.</p>
        <div className="flex gap-2">
          {(
            [
              { value: null, label: 'All' },
              { value: 'men', label: 'Only Men' },
              { value: 'women', label: 'Only Women' },
            ] as { value: Campaign['genderPreference']; label: string }[]
          ).map((option) => (
            <button
              key={option.value ?? 'all'}
              onClick={() => onUpdate({ genderPreference: option.value })}
              className={`rounded-lg border px-6 py-2.5 text-sm font-medium transition-colors ${campaign.genderPreference === option.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 4: SOURCES
// ============================================================
function StepSources({ campaign, influencers, isLoading, onUpdate }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Where should the visuals come from?</h3>
        <p className="text-sm text-gray-500">
          Balance your own uploads against platform sources, and dial in how often your trained influencers appear.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Own-Media Mix</label>
          <span className="text-sm font-medium text-gray-900">{campaign.ownMediaMix}%</span>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          What share of suggestions should pull from your own uploads vs. platform / stock sources.
        </p>
        <input
          type="range"
          min={0}
          max={100}
          value={campaign.ownMediaMix ?? 50}
          onChange={(e) => onUpdate({ ownMediaMix: parseInt(e.target.value) })}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-primary"
        />
        <div className="mt-1 flex justify-between text-xs text-gray-400">
          <span>Platform sources</span>
          <span>Own uploads</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Influencer Frequency</label>
          <span className="text-sm font-medium text-gray-900">{campaign.influencerFrequency}%</span>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          What share of posts feature one of your trained influencers. Finish training at least one influencer to enable this.
        </p>
        <input
          type="range"
          min={0}
          max={100}
          value={campaign.influencerFrequency ?? 0}
          onChange={(e) => onUpdate({ influencerFrequency: parseInt(e.target.value) })}
          disabled={influencers.length === 0 || isLoading}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-primary disabled:opacity-40"
        />
        {influencers.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Train at least one influencer in AI Studio to enable this feature.
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STEP 5: ACCOUNTS
// ============================================================
function StepAccounts({ campaign, accounts, onUpdate }: StepProps) {
  const selectedIds = (campaign.targetAccounts ?? []).map((a) => a.accountId);

  const toggleAccount = (account: SocialAccount) => {
    const current = (campaign.targetAccounts ?? []) as TargetAccount[];
    const exists = current.find((a) => a.accountId === account.id);
    if (exists) {
      onUpdate({ targetAccounts: current.filter((a) => a.accountId !== account.id) });
    } else {
      onUpdate({
        targetAccounts: [...current, { accountId: account.id, platform: account.platform }],
      });
    }
  };

  const grouped = accounts.reduce<Record<string, SocialAccount[]>>((acc, account) => {
    const list = acc[account.platform] ?? [];
    return { ...acc, [account.platform]: [...list, account] };
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Where should we post?</h3>
        <p className="text-sm text-gray-500">
          Pick one or more accounts. You can mix your own connected accounts and warmed accounts, even on the same platform.
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No accounts connected yet.</p>
          <p className="mt-1 text-xs text-gray-400">Connect your social accounts in Settings to enable posting.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([platform, platformAccounts]) => (
          <div key={platform}>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              {platform}
            </label>
            <div className="space-y-2">
              {platformAccounts.map((account) => {
                const isSelected = selectedIds.includes(account.id);
                return (
                  <button
                    key={account.id}
                    onClick={() => toggleAccount(account)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${isSelected ? 'border-primary bg-primary/10' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${isSelected ? 'border-primary bg-primary' : 'border-gray-300'
                          }`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        @{account.platformUsername ?? account.platformUserId}
                      </span>
                    </div>
                    <span className={`text-xs ${isSelected ? 'text-primary' : 'text-gray-400'}`}>
                      {isSelected ? 'Selected' : 'Connected'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ============================================================
// STEP 6: CADENCE
// ============================================================
function StepCadence({ campaign, onUpdate }: StepProps) {
  const totalPosts = calculateTotalPosts(campaign);
  const lengthOptions = [
    { value: 7, label: '1 week' },
    { value: 14, label: '2 weeks' },
    { value: 21, label: '3 weeks' },
    { value: 28, label: '4 weeks' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">How often, and for how long?</h3>
        <p className="text-sm text-gray-500">We'll spread the posts evenly across the campaign window.</p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-900">Posts per account per day</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onUpdate({ postsPerDay: Math.max(1, (campaign.postsPerDay ?? 3) - 1) })}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              -
            </button>
            <span className="text-lg font-semibold text-gray-900">{campaign.postsPerDay ?? 3}</span>
            <button
              onClick={() => onUpdate({ postsPerDay: Math.min(10, (campaign.postsPerDay ?? 3) + 1) })}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              +
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-400">Max 3 per account per day.</p>
      </div>

      <div>
        <label className="mb-3 block text-sm font-medium text-gray-900">Campaign length</label>
        <div className="flex gap-2">
          {lengthOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onUpdate({ campaignLengthDays: opt.value })}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${campaign.campaignLengthDays === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-900">Start date</label>
        <input
          type="date"
          value={campaign.startDate ?? ''}
          onChange={(e) => onUpdate({ startDate: e.target.value || null })}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-gray-400">
          This campaign can start tomorrow at the earliest. Earliest: {new Date().toISOString().split('T')[0]}.
        </p>
      </div>

      <div className="rounded-xl bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">This campaign will create</div>
            <div className="text-2xl font-bold text-gray-900">{totalPosts} posts</div>
          </div>
          <div className="text-right text-xs text-gray-500">
            {(campaign.targetAccounts ?? []).length} account{(campaign.targetAccounts ?? []).length !== 1 ? 's' : ''} ×{' '}
            {campaign.postsPerDay ?? 3}/day × {campaign.campaignLengthDays ?? 7} days
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 7: GENERATE
// ============================================================
function StepGenerate({ campaign }: StepProps) {
  const totalPosts = calculateTotalPosts(campaign);

  return (
    <div className="space-y-6 text-center">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Generate your campaign</h3>
        <p className="text-sm text-gray-500">
          We'll write content for every post in your campaign. You can re-roll, edit, or remove individual ones before launch.
        </p>
      </div>

      <div className="mx-auto grid max-w-md grid-cols-4 gap-4 rounded-xl border border-gray-200 p-4">
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900">{totalPosts}</div>
          <div className="text-xs uppercase text-gray-500">Posts</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900">{(campaign.targetAccounts ?? []).length}</div>
          <div className="text-xs uppercase text-gray-500">Accounts</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900">{campaign.postsPerDay ?? 3}/day</div>
          <div className="text-xs uppercase text-gray-500">Per account</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900">{campaign.campaignLengthDays ?? 7} days</div>
          <div className="text-xs uppercase text-gray-500">Length</div>
        </div>
      </div>

      <div className="text-sm text-gray-500">Your plan includes 25 content pieces per campaign.</div>
    </div>
  );
}

// ============================================================
// STEP 8: REVIEW
// ============================================================
function StepReview({
  campaign,
  contentItems,
  reviewError,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onScheduleChange,
}: StepProps & {
  contentItems: (ContentItem & { sequenceIndex?: number; scheduledDate?: string; scheduledTime?: string; isRolled?: boolean })[];
  reviewError: string | null;
  onEdit: (itemId: string) => void;
  onReRoll: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onApprove: (itemId: string) => void;
  onScheduleChange: (itemId: string, date: string, time: string) => void;
}) {
  return (
    <div className="space-y-6">
      {reviewError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {reviewError}
        </div>
      )}
      <CampaignReviewGrid
        campaign={campaign as Campaign}
        contentItems={contentItems}
        onEdit={onEdit}
        onReRoll={onReRoll}
        onDelete={onDelete}
        onApprove={onApprove}
        onScheduleChange={onScheduleChange}
      />
    </div>
  );
}

// ============================================================
// STEP 9: LAUNCH
// ============================================================
function StepLaunch({ campaign }: StepProps) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <Check className="h-10 w-10 text-green-600" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Campaign scheduled!</h3>
        <p className="text-sm text-gray-500">
          {campaign.name || 'Your campaign'} is now {campaign.status ?? 'scheduled'}. We'll start posting on{' '}
          {campaign.startDate
            ? new Date(campaign.startDate).toLocaleDateString()
            : 'the scheduled date'}.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// UTILS
// ============================================================
function calculateTotalPosts(campaign: Partial<Campaign>): number {
  const accounts = (campaign.targetAccounts ?? []).length || 1;
  const postsPerDay = campaign.postsPerDay ?? 3;
  const days = campaign.campaignLengthDays ?? 7;
  return accounts * postsPerDay * days;
}

const STEP_COMPONENTS: React.FC<any>[] = [
  StepBasics,
  StepAngles,
  StepVoice,
  StepSources,
  StepAccounts,
  StepCadence,
  StepGenerate,
  // Step 7 (Review) is rendered separately with extra props
  () => null,
  StepLaunch,
];
'use client';

import React, { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Check } from 'lucide-react';
import type { Campaign, ContentAngle, CampaignAngle, ContentMix, TargetAccount } from '@/types/v2';
import type { SocialAccount } from '@/types'; // existing type

interface CampaignWizardProps {
  angles: ContentAngle[];
  accounts: SocialAccount[];
  influencers: { id: string; name: string }[];
  onCreate: (campaign: Partial<Campaign>) => void;
  onGenerate: (campaignId: string) => void;
  onLaunch: (campaignId: string) => void;
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

export function CampaignWizard({ angles, accounts, influencers, onCreate, onGenerate, onLaunch }: CampaignWizardProps) {
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

  const totalSteps = STEPS.length;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const updateCampaign = useCallback((updates: Partial<Campaign>) => {
    setCampaign((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleNext = () => {
    if (currentStep === 6) {
      // Generate step — create campaign first, then trigger generation
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

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // Create the campaign first
      const created = await onCreate(campaign);
      if (created && created.id) {
        setGeneratedCampaignId(created.id);
        await onGenerate(created.id);
        setCurrentStep(7); // Move to review
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLaunch = async () => {
    if (generatedCampaignId) {
      await onLaunch(generatedCampaignId);
      setCurrentStep(8); // Move to launch confirmation
    }
  };

  const StepComponent = STEP_COMPONENTS[currentStep];

  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-900">{STEPS[currentStep].label}</span>
          <span className="text-sm text-gray-500">
            {currentStep + 1} / {totalSteps}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-orange-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="p-8">
          {StepComponent && (
            <StepComponent campaign={campaign} angles={angles} accounts={accounts} influencers={influencers} onUpdate={updateCampaign} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-8 py-4">
          <button
            onClick={handleBack}
            disabled={currentStep === 0 || isGenerating}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {currentStep === 7 ? (
            <button
              onClick={handleLaunch}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
            >
              Continue to launch
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : currentStep === 6 ? (
            <button
              onClick={handleNext}
              disabled={isGenerating}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
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
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
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
// STEP 1: BASICS
// ============================================================
function StepBasics({ campaign, onUpdate }: { campaign: Partial<Campaign>; onUpdate: (u: Partial<Campaign>) => void }) {
  const mix = campaign.contentMix || {};
  const totalMix = Object.values(mix).reduce((a, b) => (a || 0) + (b || 0), 0) as number;

  const handleMixChange = (key: keyof ContentMix, delta: number) => {
    const current = (mix[key] || 0) + delta;
    if (current < 0 || current > 100) return;
    onUpdate({
      contentMix: { ...mix, [key]: current },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">What's this campaign about?</h3>
        <p className="text-sm text-gray-500">Name your campaign and set the content mix. We'll use your brand context to generate every post.</p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Name (optional)
        </label>
        <input
          type="text"
          placeholder="23rd June 2026 Campaign"
          value={campaign.name || ''}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
              ['videoHook', 'Video hook', 'bg-yellow-400'],
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
                <span className="w-10 text-center text-sm font-medium">{mix[key] || 0}%</span>
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
          value={campaign.remixRatio || 50}
          onChange={(e) => onUpdate({ remixRatio: parseInt(e.target.value) })}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-orange-500"
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
function StepAngles({
  campaign,
  angles,
  onUpdate,
}: {
  campaign: Partial<Campaign>;
  angles: ContentAngle[];
  onUpdate: (u: Partial<Campaign>) => void;
}) {
  const campaignAngles = (campaign.angles || []) as CampaignAngle[];
  const totalWeight = campaignAngles.reduce((sum, a) => sum + (a.weight || 0), 0);

  const handleWeightChange = (angleId: string, weight: number) => {
    const updated = campaignAngles.map((a) => (a.angleId === angleId ? { ...a, weight } : a));
    // If this angle doesn't exist yet, add it
    if (!updated.find((a) => a.angleId === angleId)) {
      updated.push({ angleId, weight });
    }
    onUpdate({ angles: updated });
  };

  const equalize = () => {
    const count = angles.length;
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
          Set how often each content angle appears across the campaign. Weights are a guide. We spread the posts across your angles accordingly.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Angle Distribution</span>
        <div className="flex items-center gap-2">
          <button onClick={equalize} className="text-xs font-medium text-orange-600 hover:text-orange-700">
            Equalize
          </button>
          <span className={`text-sm font-medium ${totalWeight === 100 ? 'text-green-600' : 'text-gray-900'}`}>
            {totalWeight}/100
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {angles.map((angle) => {
          const campaignAngle = campaignAngles.find((a) => a.angleId === angle.id);
          const weight = campaignAngle?.weight || 0;
          const angleInfo = angles.find((a) => a.id === angle.id);
          return (
            <div key={angle.id} className="flex items-center gap-4">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: angleInfo?.color || '#ccc' }} />
              <span className="flex-1 truncate text-sm text-gray-700">{angle.name}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={weight}
                onChange={(e) => handleWeightChange(angle.id, parseInt(e.target.value))}
                className="w-48 accent-orange-500"
              />
              <span className="w-10 text-right text-sm font-medium">{weight}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// STEP 3: VOICE
// ============================================================
function StepVoice({ campaign, onUpdate }: { campaign: Partial<Campaign>; onUpdate: (u: Partial<Campaign>) => void }) {
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
              onClick={() => onUpdate({ mentionFrequency: freq.value as any })}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                campaign.mentionFrequency === freq.value
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
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
          {[
            { value: null, label: 'All' },
            { value: 'men', label: 'Only Men' },
            { value: 'women', label: 'Only Women' },
          ].map((option) => (
            <button
              key={option.value || 'all'}
              onClick={() => onUpdate({ genderPreference: option.value as any })}
              className={`rounded-lg border px-6 py-2.5 text-sm font-medium transition-colors ${
                campaign.genderPreference === option.value
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
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
function StepSources({
  campaign,
  influencers,
  onUpdate,
}: {
  campaign: Partial<Campaign>;
  influencers: { id: string; name: string }[];
  onUpdate: (u: Partial<Campaign>) => void;
}) {
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
          value={campaign.ownMediaMix || 50}
          onChange={(e) => onUpdate({ ownMediaMix: parseInt(e.target.value) })}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-orange-500"
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
          value={campaign.influencerFrequency || 0}
          onChange={(e) => onUpdate({ influencerFrequency: parseInt(e.target.value) })}
          disabled={influencers.length === 0}
          className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-orange-500 disabled:opacity-40"
        />
        {influencers.length === 0 && (
          <p className="mt-2 text-xs text-orange-600">Train at least one influencer in AI Studio to enable this feature.</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STEP 5: ACCOUNTS
// ============================================================
function StepAccounts({
  campaign,
  accounts,
  onUpdate,
}: {
  campaign: Partial<Campaign>;
  accounts: SocialAccount[];
  onUpdate: (u: Partial<Campaign>) => void;
}) {
  const selectedIds = (campaign.targetAccounts || []).map((a) => a.accountId);

  const toggleAccount = (account: SocialAccount) => {
    const current = (campaign.targetAccounts || []) as TargetAccount[];
    const exists = current.find((a) => a.accountId === account.id);
    if (exists) {
      onUpdate({ targetAccounts: current.filter((a) => a.accountId !== account.id) });
    } else {
      onUpdate({
        targetAccounts: [...current, { accountId: account.id, platform: account.platform }],
      });
    }
  };

  // Group by platform
  const grouped = accounts.reduce((acc, account) => {
    const platform = account.platform;
    if (!acc[platform]) acc[platform] = [];
    acc[platform].push(account);
    return acc;
  }, {} as Record<string, SocialAccount[]>);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Where should we post?</h3>
        <p className="text-sm text-gray-500">
          Pick one or more accounts. You can mix your own connected accounts and warmed accounts, even on the same platform.
        </p>
      </div>

      {Object.entries(grouped).map(([platform, platformAccounts]) => (
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
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? 'border-orange-300 bg-orange-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        isSelected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      @{account.platformUsername || account.platformUserId}
                    </span>
                  </div>
                  <span className={`text-xs ${isSelected ? 'text-orange-600' : 'text-gray-400'}`}>
                    {isSelected ? 'Selected' : 'Connected'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {accounts.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">No accounts connected yet.</p>
          <p className="mt-1 text-xs text-gray-400">Connect your social accounts in Settings to enable posting.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STEP 6: CADENCE
// ============================================================
function StepCadence({ campaign, onUpdate }: { campaign: Partial<Campaign>; onUpdate: (u: Partial<Campaign>) => void }) {
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
              onClick={() => onUpdate({ postsPerDay: Math.max(1, (campaign.postsPerDay || 3) - 1) })}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              -
            </button>
            <span className="text-lg font-semibold text-gray-900">{campaign.postsPerDay || 3}</span>
            <button
              onClick={() => onUpdate({ postsPerDay: Math.min(10, (campaign.postsPerDay || 3) + 1) })}
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
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                campaign.campaignLengthDays === opt.value
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
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
          value={campaign.startDate ? new Date(campaign.startDate).toISOString().split('T')[0] : ''}
          onChange={(e) => onUpdate({ startDate: e.target.value ? new Date(e.target.value) : null })}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
            {(campaign.targetAccounts || []).length} account × {campaign.postsPerDay || 3}/day × {campaign.campaignLengthDays || 7} days
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 7: GENERATE
// ============================================================
function StepGenerate({ campaign }: { campaign: Partial<Campaign> }) {
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
          <div className="text-xs text-gray-500 uppercase">Posts</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900">{(campaign.targetAccounts || []).length}</div>
          <div className="text-xs text-gray-500 uppercase">Account</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900">{campaign.postsPerDay || 3}/day</div>
          <div className="text-xs text-gray-500 uppercase">Per account</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900">{campaign.campaignLengthDays || 7} days</div>
          <div className="text-xs text-gray-500 uppercase">Length</div>
        </div>
      </div>

      <div className="text-sm text-gray-500">
        Your plan includes 25 content pieces per campaign.
      </div>
    </div>
  );
}

// ============================================================
// STEP 8: REVIEW
// ============================================================
function StepReview({ campaign }: { campaign: Partial<Campaign> }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Review your campaign</h3>
          <p className="text-sm text-gray-500">{campaign.generatedPosts || 0} of {campaign.totalPosts || 0} posts generated</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{campaign.reRollsRemaining || 0} re-rolls left</span>
        </div>
      </div>

      {/* Placeholder for review grid — will be populated with actual generated content */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: campaign.totalPosts || 0 }).map((_, i) => (
          <div key={i} className="aspect-[9/16] rounded-xl border border-gray-200 bg-gray-50" />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// STEP 9: LAUNCH
// ============================================================
function StepLaunch({ campaign }: { campaign: Partial<Campaign> }) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <Check className="h-10 w-10 text-green-600" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Campaign scheduled!</h3>
        <p className="text-sm text-gray-500">
          {campaign.name || 'Your campaign'} is now {campaign.status}. We'll start posting on {campaign.startDate ? new Date(campaign.startDate).toLocaleDateString() : 'the scheduled date'}.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// UTILS
// ============================================================
function calculateTotalPosts(campaign: Partial<Campaign>): number {
  const accounts = (campaign.targetAccounts || []).length || 1;
  const postsPerDay = campaign.postsPerDay || 3;
  const days = campaign.campaignLengthDays || 7;
  return accounts * postsPerDay * days;
}

// Map step index to component
const STEP_COMPONENTS = [
  StepBasics,
  StepAngles,
  StepVoice,
  StepSources,
  StepAccounts,
  StepCadence,
  StepGenerate,
  StepReview,
  StepLaunch,
];

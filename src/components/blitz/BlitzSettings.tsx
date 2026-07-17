'use client';

import {
  AlertCircle,
  CheckCircle2,
  CloudMoon,
  Loader2,
  Settings2,
  Sun,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ── Types ──────────────────────────────────────────────────────────────────────

type ContentMix = Record<string, number>;

type Angle = {
  id: string;
  name: string;
  weight?: number;
};

type SocialAccount = {
  id: string;
  platform: string;
  handle: string | null;
  profileImageUrl: string | null;
};

type AIInfluencer = {
  id: string;
  name: string;
  baseImageUrl: string | null;
  loraModelId: string | null;
  latestVideoUrls: Array<{ url: string }> | null;
  usageCount: number;
};

type InfluencerReadiness = {
  trained: boolean;
  angleLinked: boolean;
  videoGenerated: boolean;
  accountConnected: boolean;
};

type BlitzAdvanced = {
  blackoutDays?: number[];        // 0=Sun..6=Sat, omit or [] for none
  preferredTime?: string;         // 'any' | 'morning' | 'afternoon' | 'evening'
  autoApproveThreshold?: number;  // 0 = disabled
};

type CampaignSettings = {
  contentMix: ContentMix;
  remixRatio: number;
  angles: { angleId: string; weight: number }[];
  mentionFrequency: string;
  ownMediaMix: number;
  pinterestPercent: number;
  influencerFrequency: number;
  enabledInfluencerIds: string[];
  targetAccounts: { accountId: string; platform: string }[];
  genderPreference: string;
  postsPerDay: number;
  qualityThreshold: number;
  blitzAdvanced?: BlitzAdvanced;
};

type BlitzSettingsProps = {
  campaignId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: CampaignSettings;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<string, string> = {
  slideshow: 'Slideshow',
  greenScreen: 'Green Screen',
  videoHook: 'Video Hook',
  talkingHead: 'Talking Head',
  videoHookDemo: 'Video Hook Demo',
  ugc: 'UGC',
};

const MENTION_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'sometimes', label: 'Sometimes' },
  { value: 'always', label: 'Always' },
];

const GENDER_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

// ── Readiness check component ─────────────────────────────────────────────────

function ReadinessCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="size-3.5 shrink-0 text-red-400" />
      )}
      <span className={`text-xs ${ok ? 'text-muted-foreground' : 'text-red-500'}`}>{label}</span>
    </div>
  );
}

function computeReadiness(
  influencer: AIInfluencer,
  hasAngles: boolean,
  hasAccounts: boolean,
): InfluencerReadiness {
  return {
    trained: !!influencer.loraModelId,
    angleLinked: hasAngles,
    videoGenerated: !!influencer.baseImageUrl
      || (Array.isArray(influencer.latestVideoUrls) && influencer.latestVideoUrls.length > 0)
      || influencer.usageCount > 0,
    accountConnected: hasAccounts,
  };
}

// ── Main component ─────────────────────────────────────────────────────────────

export function BlitzSettings({ campaignId, open, onClose, onSaved, initial }: BlitzSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Section 1: Influencers
  const [influencerFrequency, setInfluencerFrequency] = useState(initial.influencerFrequency);
  const [influencers, setInfluencers] = useState<AIInfluencer[]>([]);
  const [influencersLoading, setInfluencersLoading] = useState(false);
  const [enabledInfluencerIds, setEnabledInfluencerIds] = useState<string[]>(
    initial.enabledInfluencerIds ?? [],
  );
  const [genderPreference, setGenderPreference] = useState(initial.genderPreference || 'any');

  // Section 2: Voice & Angles
  const [availableAngles, setAvailableAngles] = useState<Angle[]>([]);
  const [selectedAngles, setSelectedAngles] = useState<{ angleId: string; weight: number }[]>(
    initial.angles.length > 0 ? initial.angles : [],
  );
  const [mentionFrequency, setMentionFrequency] = useState(initial.mentionFrequency);

  // Section 3: Visual Sources
  const [ownMediaMix, setOwnMediaMix] = useState(initial.ownMediaMix);
  const [pinterestPercent, setPinterestPercent] = useState(initial.pinterestPercent ?? 0);

  // Section 4: Content Mix
  const [contentMix, setContentMix] = useState<ContentMix>(
    Object.keys(CONTENT_TYPE_LABELS).reduce(
      (acc, key) => ({ ...acc, [key]: initial.contentMix?.[key] ?? 0 }),
      {} as ContentMix,
    ),
  );

  const [postsPerDay, setPostsPerDay] = useState(initial.postsPerDay);
  const [qualityThreshold, setQualityThreshold] = useState(initial.qualityThreshold);

  // Section 5: Advanced settings
  const [blitzAdvanced, setBlitzAdvanced] = useState<BlitzAdvanced>(initial.blitzAdvanced ?? {});

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const toggleBlackoutDay = (day: number) => {
    setBlitzAdvanced(prev => {
      const days = prev.blackoutDays ?? [];
      const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort();
      return { ...prev, blackoutDays: next };
    });
  };

  const setPreferredTime = (t: string) => {
    setBlitzAdvanced(prev => ({ ...prev, preferredTime: t }));
  };

  const setAutoApproveThreshold = (v: number) => {
    setBlitzAdvanced(prev => ({ ...prev, autoApproveThreshold: Math.max(0, v) }));
  };

  // Plan-tier daily cap (fetched from billing status)
  // -1 = unlimited. When null, we haven't loaded yet — don't clamp.
  const [blitzCap, setBlitzCap] = useState<number | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);

  // Connected accounts (for readiness check)
  const [connectedAccounts, setConnectedAccounts] = useState<SocialAccount[]>([]);

  // Fetch data when modal opens
  useEffect(() => {
    if (!open) {
      return;
    }

    // Fetch angles
    fetch('/api/content-angles')
      .then(r => r.json())
      .then(d => setAvailableAngles(d.items || d || []))
      .catch(() => {});

    // Fetch influencers
    setInfluencersLoading(true);
    fetch('/api/ai-influencers')
      .then(r => r.json())
      .then(d => setInfluencers(d.items || []))
      .catch(() => {})
      .finally(() => setInfluencersLoading(false));

    // Fetch connected social accounts
    fetch('/api/social-accounts')
      .then(r => r.json())
      .then(d => setConnectedAccounts(d.items || d || []))
      .catch(() => {});

    // Fetch plan tier so we can clamp posts/day to the plan cap
    fetch('/api/billing/status')
      .then(r => r.json())
      .then((d) => {
        const cap = d?.features?.blitzPostsPerDay;
        if (typeof cap === 'number') {
          setBlitzCap(cap);
        }
        if (d?.plan) {
          setPlanName(d.plan);
        }
      })
      .catch(() => {});
  }, [open]);

  // Derived state
  const hasAngles = selectedAngles.length > 0;
  const hasAccounts = connectedAccounts.length > 0;

  // Normalize visual sources so they sum to 100 when adjusting
  const platformPercent = Math.max(0, 100 - ownMediaMix - pinterestPercent);

  const handleOwnMediaChange = (v: number) => {
    const capped = Math.min(v, 100 - pinterestPercent);
    setOwnMediaMix(capped);
  };

  const handlePinterestChange = (v: number) => {
    const capped = Math.min(v, 100 - ownMediaMix);
    setPinterestPercent(capped);
  };

  // Angle helpers
  const toggleAngle = useCallback((angleId: string) => {
    setSelectedAngles((prev) => {
      const exists = prev.find(a => a.angleId === angleId);
      if (exists) {
        return prev.filter(a => a.angleId !== angleId);
      }
      return [...prev, { angleId, weight: 0 }];
    });
  }, []);

  const updateAngleWeight = useCallback((angleId: string, weight: number) => {
    setSelectedAngles(prev =>
      prev.map(a => (a.angleId === angleId ? { ...a, weight: Math.max(0, Math.min(100, weight)) } : a)),
    );
  }, []);

  const updateContentMix = useCallback((key: string, value: number) => {
    setContentMix(prev => ({ ...prev, [key]: Math.max(0, Math.min(100, value)) }));
  }, []);

  const contentMixTotal = Object.values(contentMix).reduce((a, b) => a + b, 0);
  const angleWeightTotal = selectedAngles.reduce((a, b) => a + b.weight, 0);

  const normalizeWeights = useCallback(() => {
    setSelectedAngles((prev) => {
      const total = prev.reduce((s, a) => s + a.weight, 0);
      if (total === 0 || prev.length === 0) {
        return prev;
      }
      return prev.map(a => ({ ...a, weight: Math.round((a.weight / total) * 100) }));
    });
  }, []);

  const normalizeContentMix = useCallback(() => {
    setContentMix((prev) => {
      const total = Object.values(prev).reduce((a, b) => a + b, 0);
      if (total === 0) {
        return prev;
      }
      const result: ContentMix = {};
      for (const key of Object.keys(prev)) {
        result[key] = Math.round(((prev[key] ?? 0) / total) * 100);
      }
      return result;
    });
  }, []);

  // Influencer toggle
  const toggleInfluencer = useCallback((id: string) => {
    setEnabledInfluencerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentMix,
          ownMediaMix,
          pinterestPercent,
          angles: selectedAngles,
          mentionFrequency,
          influencerFrequency,
          enabledInfluencerIds,
          genderPreference,
          postsPerDay,
          qualityThreshold,
          blitzAdvanced,
          // targetAccounts persisted separately via account connect UI
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save settings');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-5" />
            Blitz Settings
          </DialogTitle>
          <DialogDescription>
            Configure how your daily Blitz content is generated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Section 1: AI Influencers */}
          <section>
            <h3 className="mb-3 text-sm font-semibold">AI Influencers</h3>
            <div className="space-y-3">
              {/* Frequency slider */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Influencer frequency</span>
                  <span className="text-sm text-muted-foreground">
                    {influencerFrequency === 0 ? 'None' : `${influencerFrequency} / campaign`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={influencerFrequency}
                  onChange={e => setInfluencerFrequency(Number.parseInt(e.target.value, 10))}
                  className="mt-2 w-full accent-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  How many AI influencer posts to include per campaign
                </p>
              </div>

              {/* Gender preference */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <Label className="text-sm font-medium">Gender preference</Label>
                <div className="mt-2 flex gap-2">
                  {GENDER_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGenderPreference(opt.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        genderPreference === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-influencer readiness list */}
              {influencerFrequency > 0 && (
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="mb-3">
                    <Label className="text-sm font-medium">Select influencers</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Only influencers that pass all 4 readiness checks can be used by Blitz.
                    </p>
                  </div>

                  {influencersLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading influencers…
                    </div>
                  )}

                  {!influencersLoading && influencers.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No AI influencers yet.
                      {' '}
                      <a href="/dashboard/ai-studio#influencers" className="text-primary underline">
                        Create one
                      </a>
                      .
                    </p>
                  )}

                  <div className="space-y-3">
                    {influencers.map((inf) => {
                      const readiness = computeReadiness(inf, hasAngles, hasAccounts);
                      const isReady = Object.values(readiness).every(Boolean);
                      const isEnabled = enabledInfluencerIds.includes(inf.id);

                      return (
                        <div
                          key={inf.id}
                          className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                            isReady
                              ? 'border bg-card'
                              : 'border bg-muted/30 opacity-70'
                          }`}
                        >
                          {/* Avatar */}
                          <div className="shrink-0">
                            {inf.baseImageUrl ? (
                              <img
                                src={inf.baseImageUrl}
                                alt={inf.name}
                                className="size-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                {inf.name[0]?.toUpperCase()}
                              </div>
                            )}
                          </div>

                          {/* Info + checks */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{inf.name}</p>
                              {!isReady && (
                                <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                                  Not ready
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
                              <ReadinessCheck label="Trained" ok={readiness.trained} />
                              <ReadinessCheck label="Angle linked" ok={readiness.angleLinked} />
                              <ReadinessCheck label="Video generated" ok={readiness.videoGenerated} />
                              <ReadinessCheck label="Account connected" ok={readiness.accountConnected} />
                            </div>
                            {!isReady && (
                              <p className="mt-1.5 text-[11px] text-red-500 dark:text-red-400">
                                Complete all 4 checks before this influencer can appear in Blitz content.
                              </p>
                            )}
                          </div>

                          {/* Enable toggle */}
                          <div className="shrink-0 pt-0.5">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              disabled={!isReady}
                              onChange={() => toggleInfluencer(inf.id)}
                              className="size-4 rounded border text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              title={!isReady ? 'Complete readiness checks to enable' : undefined}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section 2: Voice & Angles */}
          <section>
            <h3 className="mb-3 text-sm font-semibold">Voice & Angles</h3>
            <div className="space-y-3">
              {/* Mention frequency */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <Label className="text-sm font-medium">Brand mention frequency</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {MENTION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMentionFrequency(opt.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        mentionFrequency === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content angles */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-sm font-medium">Content angles</Label>
                  <button
                    type="button"
                    onClick={normalizeWeights}
                    className="text-xs text-primary hover:text-primary/80"
                    disabled={angleWeightTotal === 0}
                  >
                    Normalize weights
                  </button>
                </div>
                {availableAngles.length === 0 && (
                  <p className="text-xs text-muted-foreground">No content angles configured yet.</p>
                )}
                <div className="space-y-2">
                  {availableAngles.map((angle) => {
                    const selected = selectedAngles.find(a => a.angleId === angle.id);
                    return (
                      <div key={angle.id} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => toggleAngle(angle.id)}
                          className="size-4 rounded border text-primary"
                        />
                        <span className="flex-1 text-sm text-foreground">{angle.name}</span>
                        {selected && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={selected.weight}
                              onChange={e => updateAngleWeight(angle.id, Number.parseInt(e.target.value, 10) || 0)}
                              className="h-7 w-16 rounded-md border bg-background px-2 text-center text-xs"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {selectedAngles.length > 0 && (
                  <p
                    className={`mt-2 text-xs ${
                      angleWeightTotal === 100
                        ? 'text-green-600'
                        : angleWeightTotal > 100
                          ? 'text-amber-600'
                          : 'text-muted-foreground'
                    }`}
                  >
                    Total weight:
                    {' '}
                    {angleWeightTotal}
                    %
                    {angleWeightTotal !== 100 && ' (aim for 100%)'}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Section 3: Visual Sources */}
          <section>
            <h3 className="mb-3 text-sm font-semibold">Visual Sources</h3>
            <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
              {/* Three-way blend display */}
              <div className="flex h-2 overflow-hidden rounded-lg">
                <div
                  className="bg-primary transition-all"
                  style={{ width: `${ownMediaMix}%` }}
                  title={`Own media: ${ownMediaMix}%`}
                />
                <div
                  className="bg-pink-400 transition-all"
                  style={{ width: `${pinterestPercent}%` }}
                  title={`Pinterest: ${pinterestPercent}%`}
                />
                <div
                  className="bg-muted-foreground/30 transition-all"
                  style={{ width: `${platformPercent}%` }}
                  title={`Platform media: ${platformPercent}%`}
                />
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-primary" />
                  Own uploads
                  {' '}
                  {ownMediaMix}
                  %
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-pink-400" />
                  Pinterest
                  {' '}
                  {pinterestPercent}
                  %
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-muted-foreground/30" />
                  Platform
                  {' '}
                  {platformPercent}
                  %
                </span>
              </div>

              {/* Own media slider */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Own uploads</span>
                  <span className="text-sm text-muted-foreground">
                    {ownMediaMix}
                    %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={ownMediaMix}
                  onChange={e => handleOwnMediaChange(Number.parseInt(e.target.value, 10))}
                  className="mt-1 w-full accent-primary"
                />
              </div>

              {/* Pinterest slider (disabled stub) */}
              <div className="opacity-60">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Pinterest collections</span>
                  <span className="text-xs italic text-muted-foreground">Connect Pinterest to enable</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0}
                  step={5}
                  value={pinterestPercent}
                  disabled
                  onChange={e => handlePinterestChange(Number.parseInt(e.target.value, 10))}
                  className="mt-1 w-full cursor-not-allowed accent-pink-400"
                />
                <a
                  href="/dashboard/settings/integrations#pinterest"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-pink-600 hover:text-pink-800 dark:text-pink-400 dark:hover:text-pink-300"
                >
                  Connect Pinterest account
                </a>
              </div>

              <p className="text-xs text-muted-foreground">
                Remaining
                {' '}
                {platformPercent}
                % comes from platform trending media.
              </p>
            </div>
          </section>

          {/* Section 4: Content Mix */}
          <section>
            <h3 className="mb-3 text-sm font-semibold">Content Mix</h3>
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-sm font-medium">Type distribution</Label>
                <button
                  type="button"
                  onClick={normalizeContentMix}
                  className="text-xs text-primary hover:text-primary/80"
                  disabled={contentMixTotal === 0}
                >
                  Normalize to 100%
                </button>
              </div>
              <div className="space-y-3">
                {Object.entries(CONTENT_TYPE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-28 text-sm text-foreground">{label}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={contentMix[key] ?? 0}
                      onChange={e => updateContentMix(key, Number.parseInt(e.target.value, 10))}
                      className="flex-1 accent-primary"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={contentMix[key] ?? 0}
                      onChange={e => updateContentMix(key, Number.parseInt(e.target.value, 10) || 0)}
                      className="h-7 w-14 rounded-md border bg-background px-2 text-center text-xs"
                    />
                    <span className="w-4 text-xs text-muted-foreground">%</span>
                  </div>
                ))}
              </div>
              <p
                className={`mt-2 text-xs ${
                  contentMixTotal === 100 ? 'text-green-600' : 'text-amber-600'
                }`}
              >
                Total:
                {' '}
                {contentMixTotal}
                %
                {contentMixTotal !== 100 && ' (aim for 100%)'}
              </p>
            </div>
          </section>

          {/* Schedule */}
          <section>
            <h3 className="mb-3 text-sm font-semibold">Schedule</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/30 p-4">
                <Label className="text-sm font-medium">Posts per day</Label>
                <Input
                  type="number"
                  min={1}
                  max={blitzCap === null || blitzCap === -1 ? 999 : blitzCap}
                  value={postsPerDay}
                  onChange={(e) => {
                    const raw = Number.parseInt(e.target.value, 10) || 1;
                    const capped = blitzCap !== null && blitzCap !== -1
                      ? Math.min(raw, blitzCap)
                      : raw;
                    setPostsPerDay(Math.max(1, capped));
                  }}
                  className="mt-1"
                />
                {blitzCap !== null && blitzCap !== -1 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Your
                    {' '}
                    {planName ?? 'current'}
                    {' '}
                    plan allows up to
                    {' '}
                    {blitzCap}
                    /day.
                    {' '}
                    <a href="/dashboard/billing" className="text-primary hover:underline">
                      Upgrade for more
                    </a>
                  </p>
                )}
              </div>
              <div className="rounded-xl border bg-muted/30 p-4">
                <Label className="text-sm font-medium">Quality threshold</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(qualityThreshold * 100)}
                  onChange={e => setQualityThreshold(Number.parseInt(e.target.value, 10) / 100)}
                  className="mt-2 w-full accent-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {Math.round(qualityThreshold * 100)}
                  %
                </p>
              </div>
            </div>
          </section>

          {/* Section 5: Advanced */}
          <section>
            <h3 className="mb-3 text-sm font-semibold">Advanced</h3>
            <div className="space-y-3">
              {/* Blackout days */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <Label className="text-sm font-medium">Blackout days</Label>
                <p className="mb-2 text-xs text-muted-foreground">
                  Skip Blitz generation on selected days of the week.
                </p>
                <div className="flex gap-1.5">
                  {DAY_LABELS.map((label, i) => {
                    const active = (blitzAdvanced.blackoutDays ?? []).includes(i);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleBlackoutDay(i)}
                        className={`flex h-9 w-10 items-center justify-center rounded-lg border text-xs font-medium transition-colors ${
                          active
                            ? 'border-destructive/40 bg-destructive/10 text-destructive'
                            : 'border text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preferred posting time */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <Label className="text-sm font-medium">Preferred posting time</Label>
                <p className="mb-2 text-xs text-muted-foreground">
                  Schedule posts for a specific part of the day.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'any', icon: null, label: 'Any time' },
                    { value: 'morning', icon: Sun, label: 'Morning' },
                    { value: 'afternoon', icon: Sun, label: 'Afternoon' },
                    { value: 'evening', icon: CloudMoon, label: 'Evening' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPreferredTime(opt.value)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        (blitzAdvanced.preferredTime ?? 'any') === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {opt.icon && <opt.icon className="size-3.5" />}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-approve threshold */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <Label className="text-sm font-medium">Auto-approve threshold</Label>
                <p className="mb-2 text-xs text-muted-foreground">
                  After approving this many posts in a row from the same niche, auto-approve the
                  remaining posts from that niche. Set to 0 to disable.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={blitzAdvanced.autoApproveThreshold ?? 0}
                    onChange={e => setAutoApproveThreshold(Number.parseInt(e.target.value, 10))}
                    className="flex-1 accent-primary"
                  />
                  <span className="min-w-6 text-center text-sm text-muted-foreground">
                    {blitzAdvanced.autoApproveThreshold ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || contentMixTotal === 0}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

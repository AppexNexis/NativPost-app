"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Settings2,
  XCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type ContentMix = Record<string, number>;

interface Angle {
  id: string;
  name: string;
  weight?: number;
}

interface SocialAccount {
  id: string;
  platform: string;
  handle: string | null;
  profileImageUrl: string | null;
}

interface AIInfluencer {
  id: string;
  name: string;
  baseImageUrl: string | null;
  loraModelId: string | null;
  usageCount: number;
}

interface InfluencerReadiness {
  trained: boolean;
  angleLinked: boolean;
  videoGenerated: boolean;
  accountConnected: boolean;
}

interface CampaignSettings {
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
}

interface BlitzSettingsProps {
  campaignId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: CampaignSettings;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<string, string> = {
  slideshow: "Slideshow",
  wallOfText: "Wall of Text",
  greenScreen: "Green Screen",
  videoHook: "Video Hook",
};

const MENTION_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "rarely", label: "Rarely" },
  { value: "sometimes", label: "Sometimes" },
  { value: "always", label: "Always" },
];

const GENDER_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

// ── Readiness check component ─────────────────────────────────────────────────

function ReadinessCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
      )}
      <span className={`text-xs ${ok ? "text-gray-600" : "text-red-500"}`}>{label}</span>
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
    videoGenerated: !!influencer.baseImageUrl || influencer.usageCount > 0,
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
  const [genderPreference, setGenderPreference] = useState(initial.genderPreference || "any");

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

  // Connected accounts (for readiness check)
  const [connectedAccounts, setConnectedAccounts] = useState<SocialAccount[]>([]);

  // Fetch data when modal opens
  useEffect(() => {
    if (!open) return;

    // Fetch angles
    fetch("/api/content-angles")
      .then((r) => r.json())
      .then((d) => setAvailableAngles(d.items || d || []))
      .catch(() => {});

    // Fetch influencers
    setInfluencersLoading(true);
    fetch("/api/ai-influencers")
      .then((r) => r.json())
      .then((d) => setInfluencers(d.items || []))
      .catch(() => {})
      .finally(() => setInfluencersLoading(false));

    // Fetch connected social accounts
    fetch("/api/social-accounts")
      .then((r) => r.json())
      .then((d) => setConnectedAccounts(d.items || d || []))
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
      const exists = prev.find((a) => a.angleId === angleId);
      if (exists) return prev.filter((a) => a.angleId !== angleId);
      return [...prev, { angleId, weight: 0 }];
    });
  }, []);

  const updateAngleWeight = useCallback((angleId: string, weight: number) => {
    setSelectedAngles((prev) =>
      prev.map((a) => (a.angleId === angleId ? { ...a, weight: Math.max(0, Math.min(100, weight)) } : a)),
    );
  }, []);

  const updateContentMix = useCallback((key: string, value: number) => {
    setContentMix((prev) => ({ ...prev, [key]: Math.max(0, Math.min(100, value)) }));
  }, []);

  const contentMixTotal = Object.values(contentMix).reduce((a, b) => a + b, 0);
  const angleWeightTotal = selectedAngles.reduce((a, b) => a + b.weight, 0);

  const normalizeWeights = useCallback(() => {
    setSelectedAngles((prev) => {
      const total = prev.reduce((s, a) => s + a.weight, 0);
      if (total === 0 || prev.length === 0) return prev;
      return prev.map((a) => ({ ...a, weight: Math.round((a.weight / total) * 100) }));
    });
  }, []);

  const normalizeContentMix = useCallback(() => {
    setContentMix((prev) => {
      const total = Object.values(prev).reduce((a, b) => a + b, 0);
      if (total === 0) return prev;
      const result: ContentMix = {};
      for (const key of Object.keys(prev)) {
        result[key] = Math.round(((prev[key] ?? 0) / total) * 100);
      }
      return result;
    });
  }, []);

  // Influencer toggle
  const toggleInfluencer = useCallback((id: string) => {
    setEnabledInfluencerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
          // targetAccounts persisted separately via account connect UI
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save settings");
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Blitz Settings
          </DialogTitle>
          <DialogDescription>
            Configure how your daily Blitz content is generated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Section 1: AI Influencers */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">AI Influencers</h3>
            <div className="space-y-3">
              {/* Frequency slider */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Influencer frequency</span>
                  <span className="text-sm text-gray-500">
                    {influencerFrequency === 0 ? "None" : `${influencerFrequency} / campaign`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={influencerFrequency}
                  onChange={(e) => setInfluencerFrequency(parseInt(e.target.value, 10))}
                  className="mt-2 w-full accent-purple-600"
                />
                <p className="mt-1 text-xs text-gray-400">
                  How many AI influencer posts to include per campaign
                </p>
              </div>

              {/* Gender preference */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <Label className="text-sm font-medium text-gray-700">Gender preference</Label>
                <div className="mt-2 flex gap-2">
                  {GENDER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGenderPreference(opt.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        genderPreference === opt.value
                          ? "border-purple-500 bg-purple-50 text-purple-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-influencer readiness list */}
              {influencerFrequency > 0 && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="mb-3">
                    <Label className="text-sm font-medium text-gray-700">Select influencers</Label>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Only influencers that pass all 4 readiness checks can be used by Blitz.
                    </p>
                  </div>

                  {influencersLoading && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading influencers…
                    </div>
                  )}

                  {!influencersLoading && influencers.length === 0 && (
                    <p className="text-xs text-gray-400">
                      No AI influencers yet.{" "}
                      <a href="/dashboard/ai-studio#influencers" className="text-purple-600 underline">
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
                              ? "border-gray-200 bg-white"
                              : "border-gray-100 bg-gray-50 opacity-70"
                          }`}
                        >
                          {/* Avatar */}
                          <div className="shrink-0">
                            {inf.baseImageUrl ? (
                              <img
                                src={inf.baseImageUrl}
                                alt={inf.name}
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-sm font-semibold text-purple-600">
                                {inf.name[0]?.toUpperCase()}
                              </div>
                            )}
                          </div>

                          {/* Info + checks */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-800">{inf.name}</p>
                              {!isReady && (
                                <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
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
                              <p className="mt-1.5 text-[11px] text-red-500">
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
                              className="h-4 w-4 rounded border-gray-300 text-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
                              title={!isReady ? "Complete readiness checks to enable" : undefined}
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
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Voice & Angles</h3>
            <div className="space-y-3">
              {/* Mention frequency */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <Label className="text-sm font-medium text-gray-700">Brand mention frequency</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {MENTION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMentionFrequency(opt.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        mentionFrequency === opt.value
                          ? "border-purple-500 bg-purple-50 text-purple-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content angles */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-sm font-medium text-gray-700">Content angles</Label>
                  <button
                    type="button"
                    onClick={normalizeWeights}
                    className="text-xs text-purple-600 hover:text-purple-800"
                    disabled={angleWeightTotal === 0}
                  >
                    Normalize weights
                  </button>
                </div>
                {availableAngles.length === 0 && (
                  <p className="text-xs text-gray-400">No content angles configured yet.</p>
                )}
                <div className="space-y-2">
                  {availableAngles.map((angle) => {
                    const selected = selectedAngles.find((a) => a.angleId === angle.id);
                    return (
                      <div key={angle.id} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => toggleAngle(angle.id)}
                          className="h-4 w-4 rounded border-gray-300 text-purple-600"
                        />
                        <span className="flex-1 text-sm text-gray-700">{angle.name}</span>
                        {selected && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={selected.weight}
                              onChange={(e) => updateAngleWeight(angle.id, parseInt(e.target.value, 10) || 0)}
                              className="h-7 w-16 rounded-md border border-gray-200 px-2 text-center text-xs"
                            />
                            <span className="text-xs text-gray-400">%</span>
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
                        ? "text-green-600"
                        : angleWeightTotal > 100
                        ? "text-amber-600"
                        : "text-gray-400"
                    }`}
                  >
                    Total weight: {angleWeightTotal}%
                    {angleWeightTotal !== 100 && " (aim for 100%)"}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Section 3: Visual Sources */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Visual Sources</h3>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-4">
              {/* Three-way blend display */}
              <div className="flex rounded-lg overflow-hidden h-2">
                <div
                  className="bg-purple-500 transition-all"
                  style={{ width: `${ownMediaMix}%` }}
                  title={`Own media: ${ownMediaMix}%`}
                />
                <div
                  className="bg-pink-400 transition-all"
                  style={{ width: `${pinterestPercent}%` }}
                  title={`Pinterest: ${pinterestPercent}%`}
                />
                <div
                  className="bg-gray-300 transition-all"
                  style={{ width: `${platformPercent}%` }}
                  title={`Platform media: ${platformPercent}%`}
                />
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-purple-500" />
                  Own uploads {ownMediaMix}%
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-pink-400" />
                  Pinterest {pinterestPercent}%
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-gray-300" />
                  Platform {platformPercent}%
                </span>
              </div>

              {/* Own media slider */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Own uploads</span>
                  <span className="text-sm text-gray-500">{ownMediaMix}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={ownMediaMix}
                  onChange={(e) => handleOwnMediaChange(parseInt(e.target.value, 10))}
                  className="mt-1 w-full accent-purple-600"
                />
              </div>

              {/* Pinterest slider (disabled stub) */}
              <div className="opacity-60">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Pinterest collections</span>
                  <span className="text-xs text-gray-400 italic">Connect Pinterest to enable</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0}
                  step={5}
                  value={pinterestPercent}
                  disabled
                  onChange={(e) => handlePinterestChange(parseInt(e.target.value, 10))}
                  className="mt-1 w-full accent-pink-400 cursor-not-allowed"
                />
                <a
                  href="/dashboard/settings/integrations#pinterest"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-pink-600 hover:text-pink-800"
                >
                  Connect Pinterest account
                </a>
              </div>

              <p className="text-xs text-gray-400">
                Remaining {platformPercent}% comes from platform trending media.
              </p>
            </div>
          </section>

          {/* Section 4: Content Mix */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Content Mix</h3>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-sm font-medium text-gray-700">Type distribution</Label>
                <button
                  type="button"
                  onClick={normalizeContentMix}
                  className="text-xs text-purple-600 hover:text-purple-800"
                  disabled={contentMixTotal === 0}
                >
                  Normalize to 100%
                </button>
              </div>
              <div className="space-y-3">
                {Object.entries(CONTENT_TYPE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-28 text-sm text-gray-700">{label}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={contentMix[key] ?? 0}
                      onChange={(e) => updateContentMix(key, parseInt(e.target.value, 10))}
                      className="flex-1 accent-purple-600"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={contentMix[key] ?? 0}
                      onChange={(e) => updateContentMix(key, parseInt(e.target.value, 10) || 0)}
                      className="h-7 w-14 rounded-md border border-gray-200 px-2 text-center text-xs"
                    />
                    <span className="w-4 text-xs text-gray-400">%</span>
                  </div>
                ))}
              </div>
              <p
                className={`mt-2 text-xs ${
                  contentMixTotal === 100 ? "text-green-600" : "text-amber-600"
                }`}
              >
                Total: {contentMixTotal}%
                {contentMixTotal !== 100 && " (aim for 100%)"}
              </p>
            </div>
          </section>

          {/* Schedule */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Schedule</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <Label className="text-sm font-medium text-gray-700">Posts per day</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={postsPerDay}
                  onChange={(e) => setPostsPerDay(parseInt(e.target.value, 10) || 1)}
                  className="mt-1"
                />
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <Label className="text-sm font-medium text-gray-700">Quality threshold</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(qualityThreshold * 100)}
                  onChange={(e) => setQualityThreshold(parseInt(e.target.value, 10) / 100)}
                  className="mt-2 w-full accent-purple-600"
                />
                <p className="mt-1 text-xs text-gray-400">{Math.round(qualityThreshold * 100)}%</p>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || contentMixTotal === 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

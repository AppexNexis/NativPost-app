'use client';

/**
 * TikTokPublishModal — Audit Compliant Edition
 * Implements 100% of TikTok Content Sharing Guidelines
 */

import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  X,
  Shield,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

export type TikTokPublishSettings = {
  title: string;
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  brandOrganicToggle: boolean;
  brandContentToggle: boolean;
  commercialDisclosure: boolean;
  isAIGC: boolean;
  musicConsent: boolean;
};

type CreatorInfo = {
  nickname: string;
  creatorUsername: string | null;
  avatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoDurationSec: number;
  canPost?: boolean;
};

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE:    'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  SELF_ONLY:             'Only me (private)',
  FOLLOWER_OF_CREATOR:   'Followers',
};

interface TikTokPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublish: (settings: TikTokPublishSettings) => Promise<{ publishId?: string } | void>;
  contentItem: {
    id: string;
    caption: string;
    contentType: string;
    videoDuration?: number;
    videoUrl?: string;
  };
}

export function TikTokPublishModal({
  isOpen,
  onClose,
  onPublish,
  contentItem,
}: TikTokPublishModalProps) {
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [creatorInfo, setCreatorInfo] = useState<CreatorInfo | null>(null);
  const [freshnessTimestamp, setFreshnessTimestamp] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<TikTokPublishSettings>({
    title: '',
    privacyLevel: '',        // Guideline 2b: NO DEFAULT VALUE
    allowComment: false,     // Guideline 2c: NOT CHECKED BY DEFAULT
    allowDuet: false,        // Guideline 2c: NOT CHECKED BY DEFAULT
    allowStitch: false,      // Guideline 2c: NOT CHECKED BY DEFAULT
    commercialDisclosure: false, // Guideline 3a: OFF BY DEFAULT
    brandOrganicToggle: false,
    brandContentToggle: false,
    isAIGC: false,
    musicConsent: false,     // Must be actively checked — no default
  });

  const isPhotoPost = contentItem.contentType === 'image';

  const [publishStatus, setPublishStatus] = useState<
    'idle' | 'uploading' | 'processing' | 'success' | 'failed'
  >('idle');
  const [publishId, setPublishId] = useState<string | null>(null);

  // ── Poll for publish status after getting a publishId (Guideline 5e) ───────
  useEffect(() => {
    if (!publishId) return;
    let attempts = 0;
    const maxAttempts = 20; // ~60s total

    const poll = async () => {
      attempts++;
      try {
        const res = await fetch('/api/social-accounts/tiktok/publish-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publishId }),
        });
        const data = await res.json() as { status?: string; failReason?: string };

        if (data.status === 'PUBLISH_COMPLETE') {
          setPublishStatus('success');
          return;
        }
        if (data.status === 'FAILED') {
          setPublishStatus('failed');
          setError(data.failReason || 'TikTok processing failed.');
          return;
        }
      } catch { /* keep polling */ }

      if (attempts < maxAttempts) {
        setTimeout(poll, 3000);
      }
    };

    setPublishStatus('processing');
    setTimeout(poll, 3000);
  }, [publishId]);

  // ── Fetch AI title + creator info on open ─────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Reset state on every open
    setPublishStatus('idle');
    setPublishId(null);
    setError(null);
    setFreshnessTimestamp(null);
    setSettings({
      title: '',
      privacyLevel: '',
      allowComment: false,
      allowDuet: false,
      allowStitch: false,
      commercialDisclosure: false,
      brandOrganicToggle: false,
      brandContentToggle: false,
      isAIGC: false,
      musicConsent: false,
    });

    async function initModal() {
      setLoading(true);
      try {
        // 1. Fetch TikTok Title
        const titleRes = await fetch(`/api/content/${contentItem.id}/tiktok-title`, { method: 'POST' });
        if (titleRes.ok) {
          const titleData = await titleRes.json();
          setSettings(s => ({ ...s, title: titleData.title || '' }));
        }

        // 2. Fetch Creator Info
        const creatorRes = await fetch('/api/social-accounts/tiktok/creator-info');
        if (!creatorRes.ok) throw new Error('Failed to retrieve fresh creator profile info.');

        const creatorData: CreatorInfo = await creatorRes.json();
        setCreatorInfo(creatorData);
        setFreshnessTimestamp(Date.now());

        // Guideline 1c: Check video duration limits
        if (contentItem.contentType === 'video' && contentItem.videoDuration && creatorData.maxVideoDurationSec) {
          if (contentItem.videoDuration > creatorData.maxVideoDurationSec) {
            setError(`Your video duration (${contentItem.videoDuration}s) exceeds your TikTok account's maximum allowed limit of ${creatorData.maxVideoDurationSec}s.`);
          }
        }

        // Guideline 1b: Creator posting cap
        if (creatorData.canPost === false) {
          setError('Your TikTok account has reached its maximum posting capacity for the next 24 hours. Please try again later.');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unexpected validation error occurred.';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    initModal();
  }, [isOpen, contentItem]);

  if (!isOpen) return null;

  // ── Validation helpers ─────────────────────────────────────────────────────
  const brandTogglesActive = settings.commercialDisclosure;
  const standardDeclaration = "By posting, you agree to TikTok's Music Usage Confirmation.";
  const brandedDeclaration  = "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";

  const consentText = (brandTogglesActive && settings.brandContentToggle)
    ? brandedDeclaration
    : standardDeclaration;

  const commercialDisclosureIncomplete = brandTogglesActive && !settings.brandOrganicToggle && !settings.brandContentToggle;
  const privacyIsPrivate               = settings.privacyLevel === 'SELF_ONLY';
  const brandedContentPrivacyViolation = brandTogglesActive && settings.brandContentToggle && privacyIsPrivate;

  const isPublishDisabled =
    !settings.privacyLevel ||
    !settings.musicConsent ||                      // Guideline: active consent required
    commercialDisclosureIncomplete ||
    brandedContentPrivacyViolation ||
    !!error ||
    publishing ||
    publishStatus === 'processing' ||
    publishStatus === 'success';

  // ── Resolve playable video URL ─────────────────────────────────────────────
  const resolvedVideoUrl = contentItem.videoUrl
    ? (/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(contentItem.videoUrl)
        ? contentItem.videoUrl
        : `${contentItem.videoUrl.endsWith('/') ? contentItem.videoUrl : `${contentItem.videoUrl}/`}video.mp4`)
    : null;

  // ── Handle publish ─────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (isPublishDisabled) return;
    setPublishing(true);
    try {
      const result = await onPublish(settings);
      const pid = result?.publishId;
      if (pid && pid !== 'tiktok-pending') {
        setPublishId(pid);
        // Keep modal open to show polling status
      } else {
        onClose();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit post to TikTok';
      setError(message);
    } finally {
      setPublishing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in-30">
      <div className="relative flex h-full max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-background shadow-2xl overflow-hidden border">

        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-[#FE2C55]" />
            <h2 className="text-lg font-semibold tracking-tight">Publish to TikTok</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-muted cursor-pointer text-muted-foreground transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#FE2C55]" />
              <p className="text-sm text-muted-foreground">Retrieving fresh creator metadata and generating dynamic title...</p>
            </div>
          ) : (
            <>
              {/* 1. Account Identity Display (Guideline 1a) */}
              {creatorInfo && (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
                  {creatorInfo.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={creatorInfo.avatarUrl}
                      alt="Avatar"
                      className="h-10 w-10 rounded-full border border-neutral-200 object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-[#FE2C55]/10 flex items-center justify-center text-[#FE2C55] font-bold">
                      {creatorInfo.nickname.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground font-medium">Posting as:</p>
                    <p className="text-sm font-semibold text-foreground">
                      @{creatorInfo.creatorUsername || creatorInfo.nickname}
                    </p>
                  </div>
                  {freshnessTimestamp && (
                    <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-medium text-emerald-700 whitespace-nowrap">
                        Settings verified
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Content Preview — Guideline 5a */}
              {resolvedVideoUrl && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Content preview</label>
                  <div className="overflow-hidden rounded-lg border bg-black">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={resolvedVideoUrl}
                      className="w-full"
                      controls
                      preload="metadata"
                      playsInline
                      style={{ maxHeight: 280 }}
                    />
                  </div>
                </div>
              )}

              {/* 2. Title Input (Guideline 5b) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  TikTok Title <span className="text-xs font-normal text-muted-foreground">(editable)</span>
                </label>
                <textarea
                  value={settings.title}
                  maxLength={100}
                  onChange={(e) => setSettings(s => ({ ...s, title: e.target.value }))}
                  className="w-full min-h-[70px] rounded-lg border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FE2C55]/50 border-input"
                  placeholder="Add a catchy hook-first title..."
                />
                <div className="text-right text-xs text-muted-foreground">
                  {settings.title.length}/100 characters
                </div>
              </div>

              {/* 3. Privacy Status (Guideline 2b) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Visibility Status <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <select
                    value={settings.privacyLevel}
                    onChange={(e) => setSettings(s => ({ ...s, privacyLevel: e.target.value }))}
                    className="w-full appearance-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FE2C55]/50 cursor-pointer border-input"
                  >
                    <option value="" disabled>-- Select target audience (Required) --</option>
                    {creatorInfo?.privacyLevelOptions.map((opt) => {
                      const isPrivateOption  = opt === 'SELF_ONLY';
                      const isOptionDisabled = isPrivateOption && brandTogglesActive && settings.brandContentToggle;
                      return (
                        <option key={opt} value={opt} disabled={isOptionDisabled}>
                          {PRIVACY_LABELS[opt] || opt}
                          {isOptionDisabled ? ' (Unavailable for Branded Content)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 pointer-events-none text-muted-foreground" />
                </div>
                {brandedContentPrivacyViolation && (
                  <p className="text-xs text-destructive mt-1 font-medium">
                    ⚠️ Branded content visibility cannot be set to private. Please change audience.
                  </p>
                )}
              </div>

              {/* 4. Interaction Settings (Guideline 2c) */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Interaction Settings</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                  {/* Allow Comments */}
                  <label className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition select-none ${creatorInfo?.commentDisabled ? 'opacity-40 bg-muted cursor-not-allowed' : 'hover:bg-muted/30 cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      disabled={creatorInfo?.commentDisabled}
                      checked={settings.allowComment && !creatorInfo?.commentDisabled}
                      onChange={(e) => setSettings(s => ({ ...s, allowComment: e.target.checked }))}
                      className="accent-[#FE2C55] h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div>
                      <p className="font-medium">Allow Comments</p>
                      {creatorInfo?.commentDisabled && (
                        <p className="text-[11px] text-destructive">Disabled in app settings</p>
                      )}
                    </div>
                  </label>

                  {/* Allow Duet — video only (Guideline 2c) */}
                  {!isPhotoPost && (
                    <label className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition select-none ${creatorInfo?.duetDisabled ? 'opacity-40 bg-muted cursor-not-allowed' : 'hover:bg-muted/30 cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        disabled={creatorInfo?.duetDisabled}
                        checked={settings.allowDuet && !creatorInfo?.duetDisabled}
                        onChange={(e) => setSettings(s => ({ ...s, allowDuet: e.target.checked }))}
                        className="accent-[#FE2C55] h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <div>
                        <p className="font-medium">Allow Duet</p>
                        {creatorInfo?.duetDisabled && (
                          <p className="text-[11px] text-destructive">Disabled in app settings</p>
                        )}
                      </div>
                    </label>
                  )}

                  {/* Allow Stitch — video only (Guideline 2c) */}
                  {!isPhotoPost && (
                    <label className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition select-none ${creatorInfo?.stitchDisabled ? 'opacity-40 bg-muted cursor-not-allowed' : 'hover:bg-muted/30 cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        disabled={creatorInfo?.stitchDisabled}
                        checked={settings.allowStitch && !creatorInfo?.stitchDisabled}
                        onChange={(e) => setSettings(s => ({ ...s, allowStitch: e.target.checked }))}
                        className="accent-[#FE2C55] h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <div>
                        <p className="font-medium">Allow Stitch</p>
                        {creatorInfo?.stitchDisabled && (
                          <p className="text-[11px] text-destructive">Disabled in app settings</p>
                        )}
                      </div>
                    </label>
                  )}
                </div>
              </div>

              {/* 5. AI Generated Content (optional — good practice) */}
              <div className="rounded-lg border p-4 space-y-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.isAIGC}
                    onChange={(e) => setSettings(s => ({ ...s, isAIGC: e.target.checked }))}
                    className="accent-[#FE2C55] h-4 w-4 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">AI Generated Content</p>
                    <p className="text-xs text-muted-foreground">
                      Indicate if this content was generated or edited using AI tools
                    </p>
                  </div>
                </label>
              </div>

              {/* 6. Commercial Disclosure (Guideline 3a & 3b) */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-[#FE2C55]" />
                      Commercial Content
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Indicate whether this content promotes yourself, a brand, product or service.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.commercialDisclosure}
                    onChange={(e) => setSettings(s => ({
                      ...s,
                      commercialDisclosure: e.target.checked,
                      brandOrganicToggle: false,
                      brandContentToggle: false,
                    }))}
                    className="accent-[#FE2C55] h-4 w-4 cursor-pointer"
                  />
                </div>

                {brandTogglesActive && (
                  <div className="pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-150">

                    {/* Your Brand (Brand Organic) */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={settings.brandOrganicToggle}
                          onChange={(e) => setSettings(s => ({ ...s, brandOrganicToggle: e.target.checked }))}
                          className="accent-[#FE2C55] h-3.5 w-3.5 cursor-pointer"
                        />
                        Your Brand
                      </label>
                      <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                        You are promoting yourself or your own business. This content will be classified as Brand Organic.
                      </p>
                      {settings.brandOrganicToggle && (
                        <p className="text-[11px] text-amber-600 font-medium bg-amber-50 rounded px-2 py-1 border border-amber-200">
                          Your photo/video will be labeled as &quot;Promotional content&quot;
                        </p>
                      )}
                    </div>

                    {/* Branded Content */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={settings.brandContentToggle}
                          disabled={privacyIsPrivate}
                          onChange={(e) => setSettings(s => ({ ...s, brandContentToggle: e.target.checked }))}
                          className="accent-[#FE2C55] h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
                        />
                        Branded Content
                      </label>
                      <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                        You are promoting another brand or a third party. This content will be classified as Branded.
                      </p>
                      {settings.brandContentToggle && (
                        <p className="text-[11px] text-amber-600 font-medium bg-amber-50 rounded px-2 py-1 border border-amber-200">
                          Your asset will be labeled as &quot;Paid partnership&quot;
                        </p>
                      )}
                    </div>

                    {commercialDisclosureIncomplete && (
                      <p className="sm:col-span-2 text-xs text-destructive font-medium bg-destructive/5 p-2 rounded border border-destructive/10">
                        You need to indicate if your content promotes yourself, a third party, or both to proceed.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-muted/40 px-6 py-4 flex flex-col items-center">

          {/* Publish status feedback (Guideline 5e) */}
          {publishStatus === 'processing' && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700 w-full mb-3">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Your video is processing on TikTok. This may take a few minutes...
            </div>
          )}
          {publishStatus === 'success' && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 w-full mb-3">
              <Check className="h-4 w-4 shrink-0" />
              Published successfully! It may take a few minutes to appear on your profile.
            </div>
          )}
          {publishStatus === 'failed' && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive w-full mb-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error || 'TikTok processing failed. Please try again.'}
            </div>
          )}

          {/* Consent Declaration Checkbox (Guideline 2 & 4 — must be actively checked) */}
          <label className="flex items-start gap-2 mb-3 bg-background border rounded px-3 py-2.5 w-full cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.musicConsent}
              onChange={(e) => setSettings(s => ({ ...s, musicConsent: e.target.checked }))}
              className="accent-[#FE2C55] h-4 w-4 mt-0.5 shrink-0 cursor-pointer"
            />
            <div>
              <p className="text-[11px] font-medium text-foreground leading-relaxed">
                {consentText}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Required. Your content must comply with TikTok's policies.
              </p>
            </div>
            {settings.musicConsent && (
              <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            )}
          </label>

          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted cursor-pointer text-foreground transition"
            >
              {publishStatus === 'success' ? 'Close' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={isPublishDisabled}
              onClick={handlePublish}
              title={commercialDisclosureIncomplete
                ? 'You need to indicate if your content promotes yourself, a third party, or both.'
                : undefined}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#FE2C55] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#E11D48] transition disabled:opacity-40 disabled:hover:bg-[#FE2C55] disabled:cursor-not-allowed cursor-pointer"
            >
              {publishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading Assets...
                </>
              ) : (
                'Post to TikTok'
              )}
            </button>
          </div>

          {/* Processing warning (Guideline 5d) */}
          <p className="mt-2 text-center text-[11px] text-muted-foreground leading-relaxed">
            Note: After finishing deployment, it can take up to a few minutes for background asset processing to execute before content reflects publicly on your TikTok profile layout.
          </p>
        </div>

      </div>
    </div>
  );
}
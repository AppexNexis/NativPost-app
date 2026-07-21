'use client';

/**
 * TikTokPublishModal — Audit Compliant Edition (TikTok-guideline layout)
 *
 * Layout rebuilt to mirror TikTok's own recommended "Upload to TikTok" UI:
 *   - Left column: sticky video preview locked to a 9:16 frame (TikTok's
 *     native aspect ratio) with file properties (filename, format,
 *     resolution, size) directly beneath it.
 *   - Right column: scrollable form — account chip, caption, visibility,
 *     interaction settings, "Disclose video content" toggle (renamed from
 *     "Commercial Content" to match TikTok's own copy) with Your brand /
 *     Branded content sub-toggles, consent line, and the publish footer.
 *
 * All compliance logic (Guidelines 1a–5e) from the previous version is
 * unchanged — only the visual structure and a couple of labels moved.
 */

import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  X,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { RemotionPreviewPlayer } from '@/components/editor/RemotionPreviewPlayer';

// ── Types ──────────────────────────────────────────────────────────────────

export type TikTokPublishSettings = {
  caption: string;
  publishMethod: 'DIRECT' | 'INBOX';
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
    // Optional — pass these through from upstream media metadata when
    // available so the file-properties row matches TikTok's own upload
    // screen exactly. Any omitted field is simply hidden rather than
    // showing a misleading placeholder.
    fileName?: string;
    fileFormat?: string;
    fileSizeBytes?: number;
    videoResolutionLabel?: string; // e.g. "1080P"
  };
  /** Avatar URL from the stored social account (reliable — not from creator-info API) */
  avatarUrl?: string | null;
  /** Enrichment data + style for Remotion preview (match content detail page) */
  remotionProps?: {
    backgroundUrl: string;
    mediaSlots: Record<string, unknown>;
    script: Record<string, unknown>;
    style: Record<string, unknown>;
    layout: string;
    aspectRatio: string;
    contentType: string;
  } | null;
}

// ── Small helpers for the file-properties row ───────────────────────────────

function guessFileNameFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const clean = url.split('?')[0]?.split('#')[0] ?? url;
    const last = clean.split('/').filter(Boolean).pop();
    return last || null;
  } catch {
    return null;
  }
}

function guessFormatFromUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/\.([a-zA-Z0-9]{2,4})(?:[/?#]|$)/);
  return match?.[1] ? match[1].toUpperCase() : null;
}

function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)}MB`;
}

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TikTokPublishModal({
  isOpen,
  onClose,
  onPublish,
  contentItem,
  avatarUrl,
  remotionProps,
}: TikTokPublishModalProps) {
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [creatorInfo, setCreatorInfo] = useState<CreatorInfo | null>(null);
  const [freshnessTimestamp, setFreshnessTimestamp] = useState<number | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<TikTokPublishSettings>({
    caption: '',
    publishMethod: 'DIRECT',
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
  // Stops when modal closes or component unmounts (AbortController + canceled flag)
  useEffect(() => {
    if (!publishId) return;
    let canceled = false;
    let attempts = 0;
    const maxAttempts = 20; // ~60s total

    const poll = async () => {
      if (canceled) return;
      attempts++;
      try {
        const res = await fetch('/api/social-accounts/publish-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publishId }),
        });
        const data = await res.json() as { status?: string; failReason?: string };

        if (data.status === 'PUBLISH_COMPLETE') {
          if (!canceled) setPublishStatus('success');
          return;
        }
        if (data.status === 'FAILED') {
          if (!canceled) setPublishStatus('failed');
          if (!canceled) setError(data.failReason || 'TikTok processing failed.');
          return;
        }
      } catch { /* keep polling */ }

      if (!canceled && attempts < maxAttempts) {
        setTimeout(poll, 3000);
      }
    };

    setPublishStatus('processing');
    setTimeout(poll, 3000);

    return () => { canceled = true; };
  }, [publishId]);

  // ── Fetch AI title + creator info on open ─────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Reset state on every open
    setPublishStatus('idle');
    setPublishId(null);
    setError(null);
    setAvatarError(false);
    setFreshnessTimestamp(null);
    setSettings({
      caption: '',
      publishMethod: 'DIRECT',
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
          setSettings(s => ({ ...s, caption: titleData.title || '' }));
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

  const isPublishDisabled = !!error || publishing || publishStatus === 'processing' || publishStatus === 'success'
    || (settings.publishMethod === 'DIRECT' && (
      !settings.privacyLevel ||
      !settings.musicConsent ||                      // Guideline: active consent required
      commercialDisclosureIncomplete ||
      brandedContentPrivacyViolation
    ));

  // ── Resolve playable video URL ─────────────────────────────────────────────
  const resolvedVideoUrl = contentItem.videoUrl
    ? (/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(contentItem.videoUrl)
        ? contentItem.videoUrl
        : `${contentItem.videoUrl.endsWith('/') ? contentItem.videoUrl : `${contentItem.videoUrl}/`}video.mp4`)
    : null;

  // ── File properties row (Filename / Format / Duration / Resolution / Size) ──
  const fileName   = contentItem.fileName ?? guessFileNameFromUrl(contentItem.videoUrl) ?? null;
  const fileFormat = contentItem.fileFormat ?? guessFormatFromUrl(contentItem.videoUrl) ?? null;
  const duration    = formatDuration(contentItem.videoDuration);
  const fileSize    = formatBytes(contentItem.fileSizeBytes);
  const resolution  = contentItem.videoResolutionLabel ?? null;
  const fileProperties = [
    { label: 'Filename',   value: fileName },
    { label: 'Format',     value: fileFormat },
    { label: 'Duration',   value: duration },
    { label: 'Resolution', value: resolution },
    { label: 'Size',       value: fileSize },
  ].filter(p => !!p.value);

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
      <div className="relative flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-[#FE2C55]" />
            <h2 className="text-lg font-semibold tracking-tight">TikTok Publishing</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error banner (shown above both columns so it's never missed) */}
        {error && (
          <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* Body — sticky preview column + scrollable form column */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">

          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[#FE2C55]" />
              <p className="text-sm text-muted-foreground">Retrieving fresh creator metadata and generating dynamic title...</p>
            </div>
          ) : (
            <>
              {/* ── LEFT: sticky video preview + file properties ── */}
              <div className="flex w-full shrink-0 flex-col gap-3 border-b p-6 lg:sticky lg:top-0 lg:h-full lg:w-1/2 lg:overflow-y-auto lg:border-b-0 lg:border-r">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                  <Check className="h-4 w-4" />
                  Your video is ready!
                </div>

                {/* TikTok-native 9:16 frame — fills preview column */}
                <div className="flex-1 w-full overflow-hidden rounded-lg bg-black flex items-center justify-center" style={{ minHeight: '360px', aspectRatio: '9/16', maxHeight: '100%' }}>
                  {remotionProps ? (
                    <RemotionPreviewPlayer
                      contentType={remotionProps.contentType}
                      inputProps={remotionProps}
                    />
                  ) : resolvedVideoUrl ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      src={resolvedVideoUrl}
                      className="h-full w-full"
                      style={{ objectFit: 'cover' }}
                      controls
                      preload="metadata"
                      playsInline
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-white/50">
                      No preview available
                    </div>
                  )}
                </div>

                {/* File properties */}
                {fileProperties.length > 0 && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border bg-muted/30 p-3">
                    {fileProperties.map(p => (
                      <div key={p.label} className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{p.label}</p>
                        <p className="truncate text-xs font-semibold text-foreground" title={p.value ?? undefined}>{p.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── RIGHT: scrollable form ── */}
              <div className="flex-1 space-y-6 overflow-y-auto p-6 lg:w-1/2">

                {/* Publishing Method Selector — Direct vs Inbox */}
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Publishing Method</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSettings(s => ({ ...s, publishMethod: 'DIRECT' }))}
                      className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all ${
                        settings.publishMethod === 'DIRECT'
                          ? 'border-[#FE2C55] bg-[#FE2C55]/5 shadow-sm'
                          : 'border-border hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          settings.publishMethod === 'DIRECT' ? 'border-[#FE2C55]' : 'border-muted-foreground/40'
                        }`}>
                          {settings.publishMethod === 'DIRECT' && (
                            <span className="h-2 w-2 rounded-full bg-[#FE2C55]" />
                          )}
                        </span>
                        <span className="text-sm font-semibold text-foreground">Direct Publish</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
                        Publishes automatically from NativPost
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings(s => ({ ...s, publishMethod: 'INBOX' }))}
                      className={`flex flex-col items-start gap-1 rounded-lg border-2 p-3 text-left transition-all ${
                        settings.publishMethod === 'INBOX'
                          ? 'border-[#FE2C55] bg-[#FE2C55]/5 shadow-sm'
                          : 'border-border hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          settings.publishMethod === 'INBOX' ? 'border-[#FE2C55]' : 'border-muted-foreground/40'
                        }`}>
                          {settings.publishMethod === 'INBOX' && (
                            <span className="h-2 w-2 rounded-full bg-[#FE2C55]" />
                          )}
                        </span>
                        <span className="text-sm font-semibold text-foreground">Send to Inbox</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
                        Review and finish posting in TikTok app
                      </p>
                    </button>
                  </div>
                </div>

                {/* Account chip (Guideline 1a) */}
                {creatorInfo && (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
                    {(avatarUrl ?? creatorInfo.avatarUrl) && !avatarError ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl ?? creatorInfo.avatarUrl ?? ''}
                        alt="Avatar"
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 shrink-0 rounded-full border-2 border-[#FE2C55]/20 object-cover"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FE2C55]/10 font-bold text-[#FE2C55]">
                        {creatorInfo.nickname.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">TikTok account</p>
                      <p className="truncate text-sm font-semibold text-foreground">
                        @{creatorInfo.creatorUsername || creatorInfo.nickname}
                      </p>
                    </div>
                    {freshnessTimestamp && (
                      <div className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span className="whitespace-nowrap text-[10px] font-medium text-emerald-700">
                          Verified
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Caption (Guideline 5b) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Caption</label>
                  <textarea
                    value={settings.caption}
                    maxLength={2200}
                    onChange={(e) => setSettings(s => ({ ...s, caption: e.target.value }))}
                    className="min-h-[70px] w-full rounded-lg border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FE2C55]/50"
                    placeholder="Share more about your video... #hashtags @mentions"
                  />
                  <div className="text-right text-xs text-muted-foreground tabular-nums">
                    <span className={
                      settings.caption.length >= 2200 ? 'text-destructive font-semibold'
                      : settings.caption.length >= 2000 ? 'text-amber-500 font-medium'
                      : 'text-muted-foreground'
                    }>
                      {settings.caption.length} / 2200
                    </span>
                  </div>
                </div>

                {/* Privacy (Guideline 2b) — hidden in Inbox mode */}
                <div className={`space-y-2 ${settings.publishMethod !== 'DIRECT' ? 'hidden' : ''}`}>
                  <label className="text-sm font-medium text-foreground">
                    Who can view this video <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={settings.privacyLevel}
                      onChange={(e) => setSettings(s => ({ ...s, privacyLevel: e.target.value }))}
                      className="w-full cursor-pointer appearance-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FE2C55]/50"
                    >
                      <option value="" disabled>Select who can view this video</option>
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
                    <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  </div>
                  {brandedContentPrivacyViolation && (
                    <p className="mt-1 text-xs font-medium text-destructive">
                      ⚠️ Branded content visibility cannot be set to private. Please change audience.
                    </p>
                  )}
                </div>

                {/* Interaction settings (Guideline 2c) — hidden in Inbox mode */}
                <div className={`space-y-3 ${settings.publishMethod !== 'DIRECT' ? 'hidden' : ''}`}>
                  <label className="text-sm font-medium text-foreground">Allow users to</label>
                  <div className="flex flex-wrap gap-4">
                    <label className={`flex items-center gap-2 text-sm ${creatorInfo?.commentDisabled ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        disabled={creatorInfo?.commentDisabled}
                        checked={settings.allowComment && !creatorInfo?.commentDisabled}
                        onChange={(e) => setSettings(s => ({ ...s, allowComment: e.target.checked }))}
                        className="h-4 w-4 cursor-pointer accent-[#FE2C55] disabled:cursor-not-allowed"
                      />
                      Comment
                      {creatorInfo?.commentDisabled && <span className="text-[11px] text-destructive">(disabled)</span>}
                    </label>

                    {!isPhotoPost && (
                      <label className={`flex items-center gap-2 text-sm ${creatorInfo?.duetDisabled ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          disabled={creatorInfo?.duetDisabled}
                          checked={settings.allowDuet && !creatorInfo?.duetDisabled}
                          onChange={(e) => setSettings(s => ({ ...s, allowDuet: e.target.checked }))}
                          className="h-4 w-4 cursor-pointer accent-[#FE2C55] disabled:cursor-not-allowed"
                        />
                        Duet
                        {creatorInfo?.duetDisabled && <span className="text-[11px] text-destructive">(disabled)</span>}
                      </label>
                    )}

                    {!isPhotoPost && (
                      <label className={`flex items-center gap-2 text-sm ${creatorInfo?.stitchDisabled ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          disabled={creatorInfo?.stitchDisabled}
                          checked={settings.allowStitch && !creatorInfo?.stitchDisabled}
                          onChange={(e) => setSettings(s => ({ ...s, allowStitch: e.target.checked }))}
                          className="h-4 w-4 cursor-pointer accent-[#FE2C55] disabled:cursor-not-allowed"
                        />
                        Stitch
                        {creatorInfo?.stitchDisabled && <span className="text-[11px] text-destructive">(disabled)</span>}
                      </label>
                    )}
                  </div>
                </div>

                {/* AI-generated content (optional — good practice) — hidden in Inbox mode */}
                <label className={`flex cursor-pointer items-center gap-3 select-none ${settings.publishMethod !== 'DIRECT' ? 'hidden' : ''}`}>
                  <input
                    type="checkbox"
                    checked={settings.isAIGC}
                    onChange={(e) => setSettings(s => ({ ...s, isAIGC: e.target.checked }))}
                    className="h-4 w-4 cursor-pointer accent-[#FE2C55]"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">AI-generated content</p>
                    <p className="text-xs text-muted-foreground">Indicate if this content was generated or edited using AI tools</p>
                  </div>
                </label>

                {/* Disclose video content (Guideline 3a & 3b) — hidden in Inbox mode */}
                <div className={`space-y-3 rounded-lg border bg-muted/10 p-4 ${settings.publishMethod !== 'DIRECT' ? 'hidden' : ''}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <label htmlFor="disclose-toggle" className="text-sm font-medium text-foreground cursor-pointer">
                        Disclose video content
                      </label>
                      <p className="text-xs text-muted-foreground">
                        This video promotes goods or services in exchange for something of value
                      </p>
                    </div>
                    <button
                      id="disclose-toggle"
                      type="button"
                      role="switch"
                      aria-checked={settings.commercialDisclosure}
                      aria-label="Disclose video content"
                      onClick={() => setSettings(s => ({
                        ...s,
                        commercialDisclosure: !s.commercialDisclosure,
                        brandOrganicToggle: false,
                        brandContentToggle: false,
                      }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${settings.commercialDisclosure ? 'bg-[#FE2C55]' : 'bg-input'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${settings.commercialDisclosure ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                    </button>
                  </div>

                  {brandTogglesActive && (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-150">
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                        Your video will be labeled &quot;{settings.brandContentToggle ? 'Paid partnership' : 'Promotional content'}&quot;. This cannot be changed once your video is posted.
                      </div>
                      <p className="text-xs text-muted-foreground">You may select one or both.</p>

                      {/* Your Brand (Brand Organic) */}
                      <label className="flex cursor-pointer items-start gap-3 select-none">
                        <input
                          type="checkbox"
                          checked={settings.brandOrganicToggle}
                          onChange={(e) => setSettings(s => ({ ...s, brandOrganicToggle: e.target.checked }))}
                          className="mt-0.5 h-4 w-4 cursor-pointer accent-[#FE2C55]"
                        />
                        <div>
                          <p className="text-sm font-semibold text-foreground">Your brand</p>
                          <p className="text-xs text-muted-foreground">
                            You are promoting yourself or your own business. This video will be classified as Brand Organic.
                          </p>
                        </div>
                      </label>

                      {/* Branded Content */}
                      <label className={`flex items-start gap-3 select-none ${privacyIsPrivate ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={settings.brandContentToggle}
                          disabled={privacyIsPrivate}
                          onChange={(e) => setSettings(s => ({ ...s, brandContentToggle: e.target.checked }))}
                          className="mt-0.5 h-4 w-4 cursor-pointer accent-[#FE2C55] disabled:cursor-not-allowed"
                        />
                        <div>
                          <p className="text-sm font-semibold text-foreground">Branded content</p>
                          <p className="text-xs text-muted-foreground">
                            You are promoting another brand or a third party. This video will be classified as Branded Content.
                          </p>
                        </div>
                      </label>

                      {commercialDisclosureIncomplete && (
                        <p className="rounded border border-destructive/10 bg-destructive/5 p-2 text-xs font-medium text-destructive">
                          You need to indicate if your content promotes yourself, a third party, or both to proceed.
                        </p>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {consentText}
                  </p>
                </div>  {/* close Disclose section */}
              </div>  {/* close right column */}

            </>

          )}

        </div>  {/* close body */}

        <div className="flex flex-col items-center border-t bg-muted/40 px-6 py-4">

          {/* Publish status feedback (Guideline 5e) */}
          {publishStatus === 'processing' && (
            <div className="mb-3 flex w-full items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              Your video is processing on TikTok. This may take a few minutes...
            </div>
          )}
          {publishStatus === 'success' && (
            <div className="mb-3 flex w-full items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <Check className="h-4 w-4 shrink-0" />
              Published successfully! It may take a few minutes to appear on your profile.
            </div>
          )}
          {publishStatus === 'failed' && (
            <div className="mb-3 flex w-full items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error || 'TikTok processing failed. Please try again.'}
            </div>
          )}

          {/* Active consent checkbox — required, no default (Guideline 2 & 4) — hidden in Inbox mode */}
          <label className={`mb-3 flex w-full cursor-pointer items-start gap-2 select-none rounded border bg-background px-3 py-2.5 ${settings.publishMethod !== 'DIRECT' ? 'hidden' : ''}`}>
            <input
              type="checkbox"
              checked={settings.musicConsent}
              onChange={(e) => setSettings(s => ({ ...s, musicConsent: e.target.checked }))}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#FE2C55]"
            />
            <div>
              <p className="text-[11px] font-medium leading-relaxed text-foreground">
                {consentText}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Required. Your content must comply with TikTok's policies.
              </p>
            </div>
            {settings.musicConsent && (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            )}
          </label>

          {/* ── Publish Summary (hidden, kept for reference) ── */}
          <div className="hidden space-y-2 rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Publish Summary</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-foreground">
              <span className="font-semibold">@{creatorInfo?.creatorUsername || creatorInfo?.nickname || 'TikTok'}</span>
              {settings.publishMethod === 'DIRECT' ? (
                <>
                  {settings.privacyLevel && (
                    <span className="text-muted-foreground">·</span>
                  )}
                  {settings.privacyLevel && (
                    <span>{PRIVACY_LABELS[settings.privacyLevel] || settings.privacyLevel}</span>
                  )}
                  <span className="text-muted-foreground">·</span>
                  <span>Comments: {settings.allowComment ? 'On' : 'Off'}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>Duet: {settings.allowDuet ? 'On' : 'Off'}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>Stitch: {settings.allowStitch ? 'On' : 'Off'}</span>
                  {settings.commercialDisclosure && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-amber-600 font-medium">
                        {settings.brandContentToggle ? 'Paid partnership' : 'Promotional'}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Review and publish in TikTok app</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${settings.publishMethod === 'DIRECT' ? 'bg-[#FE2C55]' : 'bg-amber-400'}`} />
              <span>{settings.publishMethod === 'DIRECT' ? 'Direct Publish' : 'Send to Inbox'}</span>
              {settings.caption && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="truncate max-w-[200px]">&quot;{settings.caption.slice(0, 60)}{settings.caption.length > 60 ? '...' : ''}&quot;</span>
                </>
              )}
            </div>
          </div>

          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
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
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#FE2C55] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#E11D48] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#FE2C55]"
            >
              {publishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading to TikTok...
                </>
              ) : (
                settings.publishMethod === 'DIRECT' ? 'Publish to TikTok' : 'Send to Inbox'
              )}
            </button>
          </div>

          {/* Processing warning (Guideline 5d) */}
          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            TikTok may take several minutes to finish processing your video after it has been uploaded.
          </p>
        </div>  {/* close footer */}

      </div>

    </div>

  );
}
'use client';

/**
 * TikTokPublishModal — v2
 *
 * Changes from v1:
 *   - AI-generated TikTok title (fetched on open, editable)
 *   - Explicit cursor-pointer on all interactive elements
 *   - Full mobile responsiveness (full-screen sheet on mobile, dialog on desktop)
 */

import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Music,
  RefreshCw,
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
};

type CreatorInfo = {
  nickname: string;
  avatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoDurationSec: number;
};

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE:    'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  SELF_ONLY:             'Only me (private)',
  FOLLOWER_OF_CREATOR:   'Followers',
};

// ── Component ─────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (settings: TikTokPublishSettings) => void;
  contentId: string;
  caption: string;
  videoUrl?: string;
  videoDurationSec?: number;
  loading?: boolean;
};

export function TikTokPublishModal({
  open, onClose, onConfirm, contentId, caption, videoUrl,
  videoDurationSec = 0, loading = false,
}: Props) {
  const [creatorInfo,   setCreatorInfo]   = useState<CreatorInfo | null>(null);
  const [fetchError,    setFetchError]    = useState<string | null>(null);
  const [fetching,      setFetching]      = useState(false);

  // Form state
  const [title,          setTitle]          = useState('');
  const [titleLoading,   setTitleLoading]   = useState(false);
  const [privacyLevel,   setPrivacyLevel]   = useState('');
  const [allowComment,   setAllowComment]   = useState(false);
  const [allowDuet,      setAllowDuet]      = useState(false);
  const [allowStitch,    setAllowStitch]    = useState(false);
  const [disclosureOn,   setDisclosureOn]   = useState(false);
  const [yourBrand,      setYourBrand]      = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);

  // Fetch creator info + AI title when modal opens
  useEffect(() => {
    if (!open) return;

    setTitle('');
    setPrivacyLevel('');
    setAllowComment(false);
    setAllowDuet(false);
    setAllowStitch(false);
    setDisclosureOn(false);
    setYourBrand(false);
    setBrandedContent(false);
    setCreatorInfo(null);
    setFetchError(null);

    // Fetch creator info and AI title in parallel
    setFetching(true);
    setTitleLoading(true);

    Promise.all([
      fetch('/api/social-accounts/tiktok/creator-info').then(r => r.json()),
      fetch(`/api/content/${contentId}/tiktok-title`, { method: 'POST' }).then(r => r.json()),
    ]).then(([creatorData, titleData]: [CreatorInfo & { error?: string }, { title?: string }]) => {
      if (creatorData.error) {
        setFetchError(creatorData.error);
      } else {
        setCreatorInfo(creatorData);
      }
      setTitle(titleData.title || caption.split('\n')[0]?.slice(0, 100) || '');
    }).catch(() => {
      setFetchError('Could not fetch TikTok account info. Please try again.');
      setTitle(caption.split('\n')[0]?.slice(0, 100) || '');
    }).finally(() => {
      setFetching(false);
      setTitleLoading(false);
    });
  }, [open, contentId, caption]);

  // Branded content forces non-private visibility
  useEffect(() => {
    if (brandedContent && privacyLevel === 'SELF_ONLY') {
      setPrivacyLevel('PUBLIC_TO_EVERYONE');
    }
  }, [brandedContent, privacyLevel]);

  const regenerateTitle = async () => {
    setTitleLoading(true);
    try {
      const res = await fetch(`/api/content/${contentId}/tiktok-title`, { method: 'POST' });
      const data = await res.json() as { title?: string };
      if (data.title) setTitle(data.title);
    } catch { /* keep existing */ } finally {
      setTitleLoading(false);
    }
  };

  if (!open) return null;

  const durationExceeded = creatorInfo
    && videoDurationSec > 0
    && videoDurationSec > creatorInfo.maxVideoDurationSec;

  const getDeclaration = () => {
    if (!disclosureOn || (!yourBrand && !brandedContent)) {
      return "By posting, you agree to TikTok's Music Usage Confirmation.";
    }
    if (brandedContent) {
      return "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
    }
    return "By posting, you agree to TikTok's Music Usage Confirmation.";
  };

  const publishDisabled =
    loading
    || !privacyLevel
    || !!durationExceeded
    || (disclosureOn && !yourBrand && !brandedContent);

  const handlePublish = () => {
    if (publishDisabled) return;
    onConfirm({
      title:              title.slice(0, 2200),
      privacyLevel,
      allowComment,
      allowDuet,
      allowStitch,
      brandOrganicToggle: disclosureOn && yourBrand,
      brandContentToggle: disclosureOn && brandedContent,
    });
  };

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:px-4">
      {/* Modal — full-screen sheet on mobile, dialog on desktop */}
      <div className="flex w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:max-w-lg sm:rounded-2xl"
           style={{ maxHeight: '95dvh' }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-5 sm:py-4">
          <svg className="size-6 shrink-0 sm:size-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.67a8.27 8.27 0 004.84 1.55V6.78a4.85 4.85 0 01-1.07-.09z" />
          </svg>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold sm:text-base">Post to TikTok</h2>
            <p className="text-xs text-muted-foreground">Review and confirm before publishing</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────── */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">

          {fetching && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading TikTok account info...
            </div>
          )}

          {fetchError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                <p className="text-sm text-red-700">{fetchError}</p>
              </div>
            </div>
          )}

          {creatorInfo && (
            <>
              {/* Guideline 1a — Creator nickname */}
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                {creatorInfo.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={creatorInfo.avatarUrl} alt="" className="size-8 rounded-full sm:size-9" />
                ) : (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold sm:size-9">
                    {creatorInfo.nickname.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{creatorInfo.nickname}</p>
                  <p className="text-xs text-muted-foreground">Posting to this TikTok account</p>
                </div>
              </div>

              {/* Guideline 1c — Duration check */}
              {durationExceeded && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <p className="text-sm text-amber-700">
                      This video is {videoDurationSec}s but your TikTok account allows max {creatorInfo.maxVideoDurationSec}s.
                      Regenerate a shorter video before posting.
                    </p>
                  </div>
                </div>
              )}

              {/* Guideline 5a — Video preview */}
              {videoUrl && (
                <div className="overflow-hidden rounded-xl border bg-black">
                  <div className="flex items-center gap-1.5 border-b px-3 py-2">
                    <Video className="size-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Video preview</p>
                    {videoDurationSec > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">{videoDurationSec}s</span>
                    )}
                  </div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full"
                    style={{ maxHeight: 200 }}
                  />
                </div>
              )}

              {/* Guideline 2a — Title (AI-generated, fully editable) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium">
                    Caption / Title
                    <span className="ml-1 text-muted-foreground">(required, editable)</span>
                  </label>
                  <button
                    type="button"
                    onClick={regenerateTitle}
                    disabled={titleLoading}
                    title="Regenerate title with AI"
                    className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <RefreshCw className={`size-3 ${titleLoading ? 'animate-spin' : ''}`} />
                    {titleLoading ? 'Generating...' : 'Regenerate'}
                  </button>
                </div>
                <textarea
                  value={title}
                  onChange={e => setTitle(e.target.value.slice(0, 2200))}
                  rows={3}
                  maxLength={2200}
                  className="w-full cursor-text resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  {title.length}/2200
                </p>
              </div>

              {/* Guideline 2b — Privacy (no default, user must select) */}
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Who can view this video
                  <span className="ml-1 text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={privacyLevel}
                    onChange={e => setPrivacyLevel(e.target.value)}
                    className="w-full cursor-pointer appearance-none rounded-lg border bg-background px-3 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="" disabled>Select privacy level</option>
                    {creatorInfo.privacyLevelOptions.map(opt => (
                      <option
                        key={opt}
                        value={opt}
                        disabled={brandedContent && opt === 'SELF_ONLY'}
                      >
                        {PRIVACY_LABELS[opt] || opt}
                        {brandedContent && opt === 'SELF_ONLY' ? ' — unavailable for branded content' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-3 size-4 text-muted-foreground" />
                </div>
                {!privacyLevel && (
                  <p className="mt-1 text-[11px] text-amber-600">
                    You must select a privacy level before posting.
                  </p>
                )}
              </div>

              {/* Guideline 2c — Interaction toggles */}
              <div>
                <p className="mb-2 text-xs font-medium">Allow users to</p>
                <div className="space-y-2">
                  {([
                    { key: 'comment', label: 'Comment', disabled: creatorInfo.commentDisabled, value: allowComment, setter: setAllowComment },
                    { key: 'duet',    label: 'Duet',    disabled: creatorInfo.duetDisabled,    value: allowDuet,    setter: setAllowDuet    },
                    { key: 'stitch',  label: 'Stitch',  disabled: creatorInfo.stitchDisabled,  value: allowStitch,  setter: setAllowStitch  },
                  ] as const).map(({ key, label, disabled, value, setter }) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors ${
                        disabled
                          ? 'cursor-not-allowed opacity-40'
                          : 'cursor-pointer hover:bg-muted/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={value}
                        disabled={disabled}
                        onChange={e => !disabled && setter(e.target.checked)}
                        className="size-4 cursor-pointer rounded"
                      />
                      <span className="text-sm">{label}</span>
                      {disabled && (
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          Disabled in your TikTok settings
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Guideline 3 — Commercial content disclosure */}
              <div className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Disclose video content</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Turn on to disclose that this video promotes goods or services
                      in exchange for something of value.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={disclosureOn}
                    onClick={() => {
                      const next = !disclosureOn;
                      setDisclosureOn(next);
                      if (!next) { setYourBrand(false); setBrandedContent(false); }
                    }}
                    className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none ${
                      disclosureOn ? 'bg-primary' : 'bg-input'
                    }`}
                  >
                    <span className={`pointer-events-none mt-0.5 block size-5 rounded-full bg-white shadow-lg transition-transform ${
                      disclosureOn ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {disclosureOn && (
                  <>
                    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <Shield className="mt-0.5 size-4 shrink-0 text-blue-600" />
                        <p className="text-[12px] text-blue-700">
                          Your video will be labeled as promotional content.
                          This cannot be changed once posted.
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {/* Your brand */}
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={yourBrand}
                          onChange={e => setYourBrand(e.target.checked)}
                          className="mt-0.5 size-4 cursor-pointer rounded"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Your brand</p>
                          <p className="text-xs text-muted-foreground">
                            You are promoting yourself or your own business.
                          </p>
                          {yourBrand && (
                            <p className="mt-1 text-[11px] font-medium text-blue-600">
                              Your video will be labeled as &ldquo;Promotional content&rdquo;.
                            </p>
                          )}
                        </div>
                      </label>

                      {/* Branded content */}
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={brandedContent}
                          onChange={e => setBrandedContent(e.target.checked)}
                          className="mt-0.5 size-4 cursor-pointer rounded"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Branded content</p>
                          <p className="text-xs text-muted-foreground">
                            You are promoting another brand or a third party.
                          </p>
                          {brandedContent && (
                            <>
                              <p className="mt-1 text-[11px] font-medium text-blue-600">
                                Your video will be labeled as &ldquo;Paid partnership&rdquo;.
                              </p>
                              <p className="mt-0.5 text-[11px] text-amber-600">
                                Branded content cannot be posted as private.
                              </p>
                            </>
                          )}
                        </div>
                      </label>

                      {disclosureOn && !yourBrand && !brandedContent && (
                        <p className="px-1 text-[11px] text-amber-600">
                          Select at least one option to proceed.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Guideline 2+4 — Consent declaration */}
              <div className="rounded-xl border bg-muted/20 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Music className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    {getDeclaration()}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        {!fetchError && (
          <div className="shrink-0 border-t px-4 py-3 sm:px-5 sm:py-4">
            {creatorInfo ? (
              <>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishDisabled}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? (
                    <><Loader2 className="size-4 animate-spin" /> Posting to TikTok...</>
                  ) : (
                    <>
                      <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.67a8.27 8.27 0 004.84 1.55V6.78a4.85 4.85 0 01-1.07-.09z" />
                      </svg>
                      Post to TikTok
                    </>
                  )}
                </button>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  It may take a few minutes for your video to appear on your TikTok profile.
                </p>
              </>
            ) : (
              !fetching && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full cursor-pointer rounded-xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Close
                </button>
              )
            )}
          </div>
        )}

        {fetchError && (
          <div className="shrink-0 border-t px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={onClose}
              className="w-full cursor-pointer rounded-xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
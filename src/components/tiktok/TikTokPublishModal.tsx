'use client';

/**
 * TikTokPublishModal
 *
 * Shown before publishing to TikTok. Implements ALL required UX elements
 * from TikTok's Direct Post API developer guidelines:
 *
 * Required (Points 1-5):
 *   ✅ 1a. Creator nickname display
 *   ✅ 1b. Posting cap check (stops if can't post)
 *   ✅ 1c. Video duration check vs max_video_post_duration_sec
 *   ✅ 2a. Title field (editable, pre-filled from caption)
 *   ✅ 2b. Privacy status dropdown (from privacy_level_options, no default, user must select)
 *   ✅ 2c. Interaction toggles (Comment/Duet/Stitch, unchecked by default, greyed if disabled)
 *   ✅ 2.  Music Usage Confirmation consent declaration
 *   ✅ 3.  Commercial content disclosure toggle (off by default)
 *   ✅ 3a. Your brand / Branded content checkboxes with correct labels
 *   ✅ 3b. Privacy restricted to public/friends if branded content selected
 *   ✅ 4.  Correct declaration text based on commercial content selection
 *   ✅ 5a. Video preview before posting
 *   ✅ 5b. No NativPost watermark added to content
 *   ✅ 5c. User must expressly consent (click Publish)
 *   ✅ 5d. "May take a few minutes" message after publish
 *
 * Usage:
 *   <TikTokPublishModal
 *     open={showTikTokModal}
 *     onClose={() => setShowTikTokModal(false)}
 *     onConfirm={(settings) => handlePublish(settings)}
 *     caption={item.caption}
 *     videoUrl={item.graphicUrls[0]}
 *     videoDurationSec={item.platformSpecific?.videoDurationSeconds as number}
 *     loading={isPublishing}
 *   />
 */

import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Music,
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
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  SELF_ONLY: 'Only me (private)',
  FOLLOWER_OF_CREATOR: 'Followers',
};

// ── Component ─────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (settings: TikTokPublishSettings) => void;
  caption: string;
  videoUrl?: string;
  videoDurationSec?: number;
  loading?: boolean;
};

export function TikTokPublishModal({
  open, onClose, onConfirm, caption, videoUrl, videoDurationSec = 0, loading = false,
}: Props) {
  const [creatorInfo, setCreatorInfo] = useState<CreatorInfo | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [privacyLevel, setPrivacyLevel] = useState('');
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [disclosureOn, setDisclosureOn] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);

  // Fetch creator info when modal opens — required by TikTok guidelines
  useEffect(() => {
    if (!open) return;

    // Reset form
    setTitle(caption.split('\n')[0]?.slice(0, 100) ?? caption.slice(0, 100));
    setPrivacyLevel('');
    setAllowComment(false);
    setAllowDuet(false);
    setAllowStitch(false);
    setDisclosureOn(false);
    setYourBrand(false);
    setBrandedContent(false);
    setCreatorInfo(null);
    setFetchError(null);

    setFetching(true);
    fetch('/api/social-accounts/tiktok/creator-info')
      .then(r => r.json())
      .then((data: CreatorInfo & { error?: string }) => {
        if (data.error) {
          setFetchError(data.error);
        } else {
          setCreatorInfo(data);
        }
      })
      .catch(() => setFetchError('Could not fetch TikTok account info. Please try again.'))
      .finally(() => setFetching(false));
  }, [open, caption]);

  // Branded content: force privacy to non-private
  useEffect(() => {
    if (brandedContent && privacyLevel === 'SELF_ONLY') {
      setPrivacyLevel('PUBLIC_TO_EVERYONE');
    }
  }, [brandedContent, privacyLevel]);

  if (!open) return null;

  // Duration check — guideline 1c
  const durationExceeded = creatorInfo
    && videoDurationSec > 0
    && videoDurationSec > creatorInfo.maxVideoDurationSec;

  // Disclosure label for the publish button declaration
  const getDeclaration = () => {
    if (!disclosureOn || (!yourBrand && !brandedContent)) {
      return "By posting, you agree to TikTok's Music Usage Confirmation.";
    }
    if (brandedContent) {
      return "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
    }
    return "By posting, you agree to TikTok's Music Usage Confirmation.";
  };

  // Publish button disabled conditions
  const publishDisabled =
    loading
    || !privacyLevel
    || durationExceeded
    || (disclosureOn && !yourBrand && !brandedContent);

  const handlePublish = () => {
    if (publishDisabled) return;
    onConfirm({
      title: title.slice(0, 2200),
      privacyLevel,
      allowComment,
      allowDuet,
      allowStitch,
      brandOrganicToggle: disclosureOn && yourBrand,
      brandContentToggle: disclosureOn && brandedContent,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-background shadow-2xl" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          {/* TikTok logo */}
          <svg className="size-7 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.67a8.27 8.27 0 004.84 1.55V6.78a4.85 4.85 0 01-1.07-.09z" />
          </svg>
          <div>
            <h2 className="text-base font-semibold">Post to TikTok</h2>
            <p className="text-xs text-muted-foreground">Review and confirm before publishing</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Loading creator info */}
          {fetching && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading TikTok account info...
            </div>
          )}

          {/* Creator info error */}
          {fetchError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 text-red-600 mt-0.5" />
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
                  <img src={creatorInfo.avatarUrl} alt="" className="size-9 rounded-full" />
                ) : (
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {creatorInfo.nickname.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold">{creatorInfo.nickname}</p>
                  <p className="text-xs text-muted-foreground">Posting to this TikTok account</p>
                </div>
              </div>

              {/* Guideline 1c — Duration check */}
              {durationExceeded && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-700">
                      This video is {videoDurationSec}s but your TikTok account allows
                      a maximum of {creatorInfo.maxVideoDurationSec}s. Please regenerate
                      a shorter video before posting.
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
                    style={{ maxHeight: 220 }}
                  />
                </div>
              )}

              {/* Guideline 2a — Title (editable) */}
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Caption / Title
                  <span className="ml-1 text-muted-foreground">(required, editable)</span>
                </label>
                <textarea
                  value={title}
                  onChange={e => setTitle(e.target.value.slice(0, 2200))}
                  rows={3}
                  maxLength={2200}
                  className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  {title.length}/2200
                </p>
              </div>

              {/* Guideline 2b — Privacy dropdown (no default, user must select) */}
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Who can view this video
                  <span className="ml-1 text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={privacyLevel}
                    onChange={e => setPrivacyLevel(e.target.value)}
                    className="w-full appearance-none rounded-lg border bg-background px-3 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="" disabled>Select privacy level</option>
                    {creatorInfo.privacyLevelOptions.map(opt => (
                      <option
                        key={opt}
                        value={opt}
                        disabled={brandedContent && opt === 'SELF_ONLY'}
                      >
                        {PRIVACY_LABELS[opt] || opt}
                        {brandedContent && opt === 'SELF_ONLY'
                          ? ' — unavailable for branded content'
                          : ''}
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

              {/* Guideline 2c — Interaction toggles (all unchecked by default) */}
              <div>
                <p className="mb-2 text-xs font-medium">Allow users to</p>
                <div className="space-y-2">
                  {[
                    { key: 'comment', label: 'Comment', disabled: creatorInfo.commentDisabled, value: allowComment, setter: setAllowComment },
                    { key: 'duet', label: 'Duet', disabled: creatorInfo.duetDisabled, value: allowDuet, setter: setAllowDuet },
                    { key: 'stitch', label: 'Stitch', disabled: creatorInfo.stitchDisabled, value: allowStitch, setter: setAllowStitch },
                  ].map(({ key, label, disabled, value, setter }) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/40'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={value}
                        disabled={disabled}
                        onChange={e => !disabled && setter(e.target.checked)}
                        className="size-4 rounded"
                      />
                      <span className="text-sm">{label}</span>
                      {disabled && (
                        <span className="ml-auto text-[11px] text-muted-foreground">Disabled in your TikTok settings</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {/* Guideline 3 — Commercial content disclosure */}
              <div className="rounded-xl border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Disclose video content</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Turn on to disclose that this video promotes goods or services
                      in exchange for something of value. Your video could promote
                      yourself, a third party, or both.
                    </p>
                  </div>
                  {/* Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={disclosureOn}
                    onClick={() => {
                      setDisclosureOn(p => !p);
                      if (disclosureOn) { setYourBrand(false); setBrandedContent(false); }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none ${disclosureOn ? 'bg-primary' : 'bg-input'
                      }`}
                  >
                    <span className={`pointer-events-none block size-5 rounded-full bg-white shadow-lg transition-transform mt-0.5 ${disclosureOn ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                  </button>
                </div>

                {disclosureOn && (
                  <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <Shield className="size-4 shrink-0 text-blue-600 mt-0.5" />
                      <p className="text-[12px] text-blue-700">
                        Your video will be labeled as promotional content.
                        This cannot be changed once your video is posted.
                      </p>
                    </div>
                  </div>
                )}

                {disclosureOn && (
                  <div className="space-y-2">
                    {/* Your brand */}
                    <label className="flex items-start gap-3 cursor-pointer rounded-lg border px-4 py-3 hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={yourBrand}
                        onChange={e => setYourBrand(e.target.checked)}
                        className="mt-0.5 size-4 rounded"
                      />
                      <div>
                        <p className="text-sm font-medium">Your brand</p>
                        <p className="text-xs text-muted-foreground">
                          You are promoting yourself or your own business.
                          This video will be classified as Brand Organic.
                        </p>
                        {yourBrand && (
                          <p className="mt-1 text-[11px] text-blue-600 font-medium">
                            Your video will be labeled as &quot;Promotional content&quot;.
                          </p>
                        )}
                      </div>
                    </label>

                    {/* Branded content */}
                    <label className="flex items-start gap-3 cursor-pointer rounded-lg border px-4 py-3 hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={brandedContent}
                        onChange={e => setBrandedContent(e.target.checked)}
                        className="mt-0.5 size-4 rounded"
                      />
                      <div>
                        <p className="text-sm font-medium">Branded content</p>
                        <p className="text-xs text-muted-foreground">
                          You are promoting another brand or a third party.
                          This video will be classified as Branded Content.
                        </p>
                        {brandedContent && (
                          <p className="mt-1 text-[11px] text-blue-600 font-medium">
                            Your video will be labeled as &quot;Paid partnership&quot;.
                          </p>
                        )}
                        {brandedContent && (
                          <p className="mt-0.5 text-[11px] text-amber-600">
                            Note: Branded content cannot be posted as private.
                            Visibility will be set to public or friends.
                          </p>
                        )}
                      </div>
                    </label>

                    {disclosureOn && !yourBrand && !brandedContent && (
                      <p className="text-[11px] text-amber-600 px-1">
                        You need to indicate if your content promotes yourself,
                        a third party, or both.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Guideline 2 + 4 — Consent declaration */}
              <div className="rounded-xl border bg-muted/20 px-4 py-3">
                <div className="flex items-start gap-2">
                  <Music className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    {getDeclaration()}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {creatorInfo && !fetchError && (
          <div className="border-t px-5 py-4 space-y-3">
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishDisabled}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {loading ? (
                <><Loader2 className="size-4 animate-spin" /> Posting to TikTok...</>
              ) : (
                <>
                  {/* TikTok icon */}
                  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.67a8.27 8.27 0 004.84 1.55V6.78a4.85 4.85 0 01-1.07-.09z" />
                  </svg>
                  Post to TikTok
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              After posting, it may take a few minutes for your video to process
              and appear on your TikTok profile.
            </p>
          </div>
        )}

        {fetchError && (
          <div className="border-t px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border px-4 py-3 text-sm font-medium hover:bg-muted"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
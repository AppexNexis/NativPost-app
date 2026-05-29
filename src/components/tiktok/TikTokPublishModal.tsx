'use client';

/**
 * TikTokPublishModal — Audit Compliant Edition
 * Implements 100% of TikTok Content Sharing Guidelines
 */

import {
  AlertCircle,
  ChevronDown,
  Loader2,
  Music,
  X,
  Shield,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

export type TikTokPublishSettings = {
  title: string;
  privacyLevel: string; // Left empty initially to force manual selection
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  brandOrganicToggle: boolean;
  brandContentToggle: boolean;
  commercialDisclosure: boolean; // Main toggle container
};

type CreatorInfo = {
  nickname: string;
  avatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoDurationSec: number;
  // Included to support Section 1b caps
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
  onPublish: (settings: TikTokPublishSettings) => Promise<void>;
  contentItem: {
    id: string;
    caption: string;
    contentType: string; // 'video' or 'image'
    videoDuration?: number; // duration in seconds if video
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
  const [error, setError] = useState<string | null>(null);

  // Form State - strictly following rules (No defaults for interactive settings)
  const [settings, setSettings] = useState<TikTokPublishSettings>({
    title: '',
    privacyLevel: '', // Guideline 2b: NO DEFAULT VALUE
    allowComment: false, // Guideline 2c: NOT CHECKED BY DEFAULT
    allowDuet: false,    // Guideline 2c: NOT CHECKED BY DEFAULT
    allowStitch: false,  // Guideline 2c: NOT CHECKED BY DEFAULT
    commercialDisclosure: false, // Guideline 3a: OFF BY DEFAULT
    brandOrganicToggle: false,
    brandContentToggle: false,
  });

  const isPhotoPost = contentItem.contentType === 'image';

  // Fetch AI title and Creator info on open
  useEffect(() => {
    if (!isOpen) return;

    async function initModal() {
      setLoading(true);
      setError(null);
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

        // Guideline 1c: Check video duration limits immediately
        if (contentItem.contentType === 'video' && contentItem.videoDuration && creatorData.maxVideoDurationSec) {
          if (contentItem.videoDuration > creatorData.maxVideoDurationSec) {
            setError(`Your video duration (${contentItem.videoDuration}s) exceeds your TikTok account's current maximum allowed limit of ${creatorData.maxVideoDurationSec}s.`);
          }
        }

        // Guideline 1b: If API signals creator cap hit
        if (creatorData.canPost === false) {
          setError('Your TikTok account has reached its maximum posting capacity for the next 24 hours. Please try again later.');
        }

      } catch (err: any) {
        setError(err.message || 'An unexpected validation error occurred.');
      } finally {
        setLoading(false);
      }
    }

    initModal();
  }, [isOpen, contentItem]);

  if (!isOpen) return null;

  // ── Validation Helpers (Guideline Section 3 & 4) ───────────────────────────
  const brandTogglesActive = settings.commercialDisclosure;
  const standardDeclaration = "By posting, you agree to TikTok's Music Usage Confirmation.";
  const brandedDeclaration = "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";

  // Determine what consent declaration to render dynamically (Guideline 4)
  let consentText = standardDeclaration;
  if (brandTogglesActive && settings.brandContentToggle) {
    consentText = brandedDeclaration;
  }

  // Check if publishing should be locked (Guideline 3a rules)
  const commercialDisclosureIncomplete = brandTogglesActive && !settings.brandOrganicToggle && !settings.brandContentToggle;
  const privacyIsPrivate = settings.privacyLevel === 'SELF_ONLY';
  const brandedContentPrivacyViolation = brandTogglesActive && settings.brandContentToggle && privacyIsPrivate;
  
  const isPublishDisabled = 
    !settings.privacyLevel || 
    commercialDisclosureIncomplete || 
    brandedContentPrivacyViolation || 
    !!error || 
    publishing;

  const handlePublish = async () => {
    if (isPublishDisabled) return;
    setPublishing(true);
    try {
      await onPublish(settings);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit post to TikTok');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in-30">
      <div className="relative flex h-full max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-background shadow-2xl overflow-hidden border">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-[#FE2C55]" />
            <h2 className="text-lg font-semibold tracking-tight">Publish to TikTok</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted cursor-pointer text-muted-foreground transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Error banner / Constraint violations */}
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
                    <img src={creatorInfo.avatarUrl} alt="Avatar" className="h-10 w-10 rounded-full border border-neutral-200 object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-[#FE2C55]/10 flex items-center justify-center text-[#FE2C55] font-bold">
                      {creatorInfo.nickname.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Posting as:</p>
                    <p className="text-sm font-semibold text-foreground">@{creatorInfo.nickname}</p>
                  </div>
                </div>
              )}

              {/* 2. Text / Title Input Field (Guideline 5b) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">TikTok Title (Editable)</label>
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

              {/* 3. Privacy Status - Mandated Manual Dropdown Select (Guideline 2b) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Visibility Status <span className="text-destructive">*</span></label>
                <div className="relative">
                  <select
                    value={settings.privacyLevel}
                    onChange={(e) => setSettings(s => ({ ...s, privacyLevel: e.target.value }))}
                    className="w-full appearance-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FE2C55]/50 cursor-pointer border-input"
                  >
                    <option value="" disabled>-- Select target audience (Required) --</option>
                    {creatorInfo?.privacyLevelOptions.map((opt) => {
                      // Disallow private option proactively if Branded Content checked (Guideline 3b)
                      const isPrivateOption = opt === 'SELF_ONLY';
                      const isOptionDisabled = isPrivateOption && brandTogglesActive && settings.brandContentToggle;
                      return (
                        <option key={opt} value={opt} disabled={isOptionDisabled}>
                          {PRIVACY_LABELS[opt] || opt} {isOptionDisabled ? '(Unavailable for Branded Content)' : ''}
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

              {/* 4. Interactive Permissions (Guideline 2c) */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Interaction Settings</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Comments Option */}
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
                      {creatorInfo?.commentDisabled && <p className="text-[11px] text-destructive">Disabled in app settings</p>}
                    </div>
                  </label>

                  {/* Duet Option - Hidden or Blocked on Photo Posts */}
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
                        {creatorInfo?.duetDisabled && <p className="text-[11px] text-destructive">Disabled in app settings</p>}
                      </div>
                    </label>
                  )}

                  {/* Stitch Option - Hidden or Blocked on Photo Posts */}
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
                        {creatorInfo?.stitchDisabled && <p className="text-[11px] text-destructive">Disabled in app settings</p>}
                      </div>
                    </label>
                  )}
                </div>
              </div>

              {/* 5. Commercial Disclosure Settings (Guideline 3a & 3b) */}
              <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Shield className="h-4 w-4 text-[#FE2C55]" />
                      Commercial Content Disclosure
                    </span>
                    <p className="text-xs text-muted-foreground">Indicate whether this content promotes yourself, a brand, product or service.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.commercialDisclosure}
                    onChange={(e) => setSettings(s => ({ 
                      ...s, 
                      commercialDisclosure: e.target.checked,
                      brandOrganicToggle: false, // Reset internal choices if main container toggled
                      brandContentToggle: false 
                    }))}
                    className="accent-[#FE2C55] h-4 w-4 cursor-pointer"
                  />
                </div>

                {brandTogglesActive && (
                  <div className="pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-150">
                    
                    {/* Your Brand Toggle */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={settings.brandOrganicToggle}
                          onChange={(e) => setSettings(s => ({ ...s, brandOrganicToggle: e.target.checked }))}
                          className="accent-[#FE2C55] h-3.5 w-3.5 cursor-pointer"
                        />
                        Your Brand (Promoting own business)
                      </label>
                      {settings.brandOrganicToggle && (
                        <p className="text-[11px] text-amber-600 font-medium bg-amber-50 rounded px-2 py-1 border border-amber-200">
                          Your asset will be labeled as "Promotional content"
                        </p>
                      )}
                    </div>

                    {/* Branded Content Toggle */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={settings.brandContentToggle}
                          disabled={privacyIsPrivate}
                          onChange={(e) => setSettings(s => ({ ...s, brandContentToggle: e.target.checked }))}
                          className="accent-[#FE2C55] h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
                        />
                        Branded Content (Promoting third-party)
                      </label>
                      {settings.brandContentToggle && (
                        <p className="text-[11px] text-amber-600 font-medium bg-amber-50 rounded px-2 py-1 border border-amber-200">
                          Your asset will be labeled as "Paid partnership"
                        </p>
                      )}
                    </div>

                    {/* Fallback Tooltip Error if container on but selections missing */}
                    {commercialDisclosureIncomplete && (
                      <p className="sm:col-span-2 text-xs text-destructive font-medium bg-destructive/5 p-2 rounded border border-destructive/10">
                        ℹ️ You need to indicate if your content promotes yourself, a third party, or both to proceed.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Area with Explicit Consent Declaration & Sticky Controls */}
        <div className="border-t bg-muted/40 px-6 py-4 flex flex-col items-center">
          
          {/* Dynamic Legal Consent Declaration (Guideline 2 & 4) */}
          <div className="flex items-center gap-2 mb-3 bg-background border rounded px-3 py-1.5 w-full">
            <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <p className="text-[11px] font-medium text-muted-foreground">
              <span className="text-foreground font-semibold">Consent Declaration:</span> {consentText}
            </p>
          </div>

          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted cursor-pointer text-foreground transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPublishDisabled}
              onClick={handlePublish}
              title={commercialDisclosureIncomplete ? "You need to indicate if your content promotes yourself, a third party, or both." : undefined}
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
          
          {/* Processing Warning Note (Guideline 5d) */}
          <p className="mt-2 text-center text-[11px] text-muted-foreground leading-relaxed">
            Note: After finishing deployment, it can take up to a few minutes for background asset processing to execute before content reflects publicly on your TikTok profile layout.
          </p>
        </div>

      </div>
    </div>
  );
}
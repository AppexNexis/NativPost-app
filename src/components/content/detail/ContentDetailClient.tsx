'use client';

/**
 * ContentDetailClient — client shell for /dashboard/content/[id].
 *
 * Rebuilt to fix the biggest reported bug: the preview panel used to rely
 * solely on `enrichmentData.sourceMediaSlots`, which is only stashed by
 * EditorLayout — so content created by Blitz, campaign engine, or Apify
 * ingestion rendered a blank preview. `media-resolvers.resolveMediaSlots`
 * now reconstructs the full slot shape from every known source.
 *
 * Layout:
 *   - Desktop (lg+): 2-column grid, left = preview + caption + enrichment
 *     + engagement, right = actions + schedule + published-to + details
 *   - Mobile: single column stack; MobileActionBar sticks to the bottom.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { PageHeader } from '@/features/dashboard/PageHeader';
import type { ContentItem } from '@/types/v2';
import type { TikTokPublishSettings } from '@/components/tiktok/TikTokPublishModal';
import { TikTokPublishModal } from '@/components/tiktok/TikTokPublishModal';

import { ActionsPanel } from './ActionsPanel';
import { CaptionPanel } from './CaptionPanel';
import { ContentPreview } from './ContentPreview';
import { DeleteDialog } from './DeleteDialog';
import { DetailHeader } from './DetailHeader';
import { DetailsPanel } from './DetailsPanel';
import { EngagementPanel } from './EngagementPanel';
import { EnrichmentPanel } from './EnrichmentPanel';
import { LoadingSkeleton } from './LoadingSkeleton';
import { MobileActionBar } from './MobileActionBar';
import { NotFoundState } from './NotFoundState';
import type { Publication } from './PublishedToPanel';
import { PublishedToPanel } from './PublishedToPanel';
import { RejectDialog } from './RejectDialog';
import { RejectionPanel } from './RejectionPanel';
import { SchedulePanel } from './SchedulePanel';
import { resolveMediaSlots } from './media-resolvers';

type Campaign = { id: string; name: string; reRollsRemaining: number };
type Template = { id: string; contentType?: string };
type Influencer = { id: string; name: string; baseImageUrl: string | null };
type Angle = { id: string; name: string; color: string | null };

const MEDIA_CONTENT_TYPES = new Set([
  'single_image', 'slideshow', 'reel', 'ugc', 'ugc_ad',
  'data_story', 'wall_of_text', 'talking_head', 'green_screen',
  'green_screen_meme', 'video_hook', 'video_hook_demo', 'carousel',
]);

type Props = { id: string };

export function ContentDetailClient({ id }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [item, setItem] = useState<ContentItem | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [angle, setAngle] = useState<Angle | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [scheduleOpenMobile, setScheduleOpenMobile] = useState(false);

  const [retryingPlatform, setRetryingPlatform] = useState<string | null>(null);
  const [tiktokAccountAvatar, setTiktokAccountAvatar] = useState<string | null>(null);

  // ── Connected accounts — cross-reference with targetPlatforms ──────────
  // Blitz/Campaigns set targetPlatforms at generation time. If a user later
  // disconnects a platform (e.g. TikTok), it should NOT appear in the UI
  // or trigger review flows. We fetch active accounts and filter.
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);

  // ── TikTok per-platform review ─────────────────────────────────────────
  const [tiktokModalOpen, setTiktokModalOpen] = useState(false);
  const [pendingTiktokSettings, setPendingTiktokSettings] = useState<TikTokPublishSettings | null>(null);
  // Only filter when connectedPlatforms has loaded, otherwise show all
  // (avoids flash where platforms briefly disappear on slow social-accounts fetch)
  const effectivePlatforms = connectedPlatforms.length > 0
    ? (item?.targetPlatforms as string[])?.filter(p => connectedPlatforms.includes(p)) || []
    : (item?.targetPlatforms as string[]) || [];
  const effectiveHasTiktok = effectivePlatforms.includes('tiktok');

  const editorHref = useMemo(() => `/dashboard/editor?contentItemId=${id}`, [id]);

  // ── Remotion preview props for TikTok modal (before early return — rules of hooks) ──
  const tiktokRemotionProps = useMemo(() => {
    if (!item) return null;
    const ed = (item.enrichmentData as Record<string, any>)?.editorScript as
      { hookText?: string; bodyText?: string; ctaText?: string } | undefined;
    const script = ed && (ed.hookText || ed.bodyText || ed.ctaText)
      ? ed
      : (() => {
          const lines = (item.caption || '').split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length === 0) return {};
          if (lines.length === 1) return { hookText: lines[0] };
          if (lines.length === 2) return { hookText: lines[0], bodyText: lines[1] };
          return { hookText: lines[0], bodyText: lines.slice(1, -1).join('\n'), ctaText: lines[lines.length - 1] };
        })();
    const mediaSlots = resolveMediaSlots(item);
    const aspectRatio = item.aspectRatio || '9:16';
    const bgUrl = mediaSlots.background?.url
      || mediaSlots.hookVideo?.url
      || mediaSlots.demoVideo?.url
      || (item.graphicUrls?.[0] || '');
    if (!bgUrl) return null;
    const enrichment = (item.enrichmentData || {}) as Record<string, any>;
    return {
      backgroundUrl: bgUrl,
      mediaSlots: mediaSlots as unknown as Record<string, unknown>,
      script: script as Record<string, unknown>,
      style: (enrichment.editorStyle || {}) as Record<string, unknown>,
      layout: (enrichment.editorLayout as string) || 'centered',
      aspectRatio,
      contentType: item.contentType,
      previewMode: true,
      posterUrl: item.graphicUrls?.[0] || '',
    };
  }, [item]);

  // Initial load
  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const res = await fetch(`/api/content/${id}`);
        if (!res.ok) {
          if (ok && res.status === 404) setNotFound(true);
          return;
        }
        const data = await res.json();
        if (!ok) return;
        const loaded = data.item as ContentItem;
        setItem(loaded);
        setPublications((data.publications as Publication[]) || []);

        // Fan-out related loads.
        if (loaded.campaignId) {
          fetch(`/api/campaigns/${loaded.campaignId}`).then(r => r.ok ? r.json() : null).then(d => ok && d && setCampaign(d.item)).catch(() => {});
        }
        if (loaded.templateId) {
          fetch(`/api/templates/${loaded.templateId}`).then(r => r.ok ? r.json() : null).then(d => ok && d && setTemplate(d.item)).catch(() => {});
        }
        if (loaded.influencerId) {
          fetch(`/api/ai-influencers/${loaded.influencerId}`).then(r => r.ok ? r.json() : null).then(d => ok && d && setInfluencer(d.item)).catch(() => {});
        }
        if (loaded.angleId) {
          fetch(`/api/content-angles/${loaded.angleId}`).then(r => r.ok ? r.json() : null).then(d => ok && d && setAngle(d.item)).catch(() => {});
        }

        // Fetch connected social accounts — filter targetPlatforms + get TikTok avatar
        fetch('/api/social-accounts').then(r => r.ok ? r.json() : null).then(d => {
          if (ok && d?.accounts) {
            const accounts = d.accounts as Array<{ platform: string; isActive: boolean; profileImageUrl?: string }>;
            const active = accounts.filter(a => a.isActive).map(a => a.platform);
            setConnectedPlatforms(active);
            // Get TikTok avatar from stored social account (known to work)
            const tiktokAcc = accounts.find(a => a.platform === 'tiktok' && a.isActive);
            if (tiktokAcc?.profileImageUrl) setTiktokAccountAvatar(tiktokAcc.profileImageUrl);
          }
        }).catch(() => {});
      } finally {
        if (ok) setIsLoading(false);
      }
    })();
    return () => { ok = false; };
  }, [id]);

  // Auto-schedule from query param
  useEffect(() => {
    if (isLoading || !item) return;
    const autoSchedule = searchParams.get('autoSchedule');
    if (autoSchedule) setScheduleOpenMobile(true);
  }, [isLoading, item, searchParams]);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Content detail" />
        <LoadingSkeleton />
      </>
    );
  }
  if (notFound || !item) {
    return (
      <>
        <PageHeader title="Content detail" />
        <NotFoundState />
      </>
    );
  }

  const enrichment = (item.enrichmentData || {}) as Record<string, any>;
  const needsMedia = MEDIA_CONTENT_TYPES.has(item.contentType);
  const hasMedia = (item.graphicUrls && item.graphicUrls.length > 0)
    || Object.keys(resolveMediaSlots(item)).length > 0;
  const canPublish = item.status === 'approved' && (!needsMedia || hasMedia);

  // Actions
  const patch = async (body: Record<string, any>): Promise<ContentItem | null> => {
    const res = await fetch(`/api/content/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.item as ContentItem;
  };

  const updateStatus = async (status: string) => {
    setActionLoading(status === 'approved' ? 'approve' : status);
    try {
      const updated = await patch({ status });
      if (updated) setItem(updated);
    } finally { setActionLoading(null); }
  };

  const saveCaption = async (caption: string) => {
    setActionLoading('save');
    try {
      const updated = await patch({ caption });
      if (updated) setItem(updated);
    } finally { setActionLoading(null); }
  };

  const schedule = async (scheduledFor: string) => {
    setActionLoading('schedule');
    try {
      const updated = await patch({ status: 'scheduled', scheduledFor });
      if (updated) setItem(updated);
    } finally { setActionLoading(null); }
  };

  const publishNow = async () => {
    // If TikTok is a target platform and no settings collected yet, open modal
    if (effectiveHasTiktok && !pendingTiktokSettings) {
      setTiktokModalOpen(true);
      return;
    }
    await executePublish();
  };

  const executePublish = async (tiktokSettings?: TikTokPublishSettings) => {
    setActionLoading('publish');
    try {
      const res = await fetch(`/api/content/${item.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tiktokSettings ? { tiktokSettings } : {}),
      });
      if (res.ok) {
        const body = await res.json() as { published?: boolean; results?: { platform: string; success: boolean; platformPostId?: string }[] };
        const refreshRes = await fetch(`/api/content/${item.id}`);
        if (refreshRes.ok) {
          const j = await refreshRes.json();
          setItem(j.item);
          setPublications((j.publications as Publication[]) || []);
        }
        return body;
      }
      return { published: false, results: [] };
    } finally { setActionLoading(null); }
  };

  const handleTikTokPublish = async (settings: TikTokPublishSettings) => {
    setPendingTiktokSettings(settings);
    const result = await executePublish(settings);
    // Extract TikTok publishId so the modal can keep polling if the
    // backend poll loop timed out before TikTok finished processing.
    if (result?.results) {
      const tiktokResult = result.results.find(
        (r: { platform: string }) => r.platform === 'tiktok',
      );
      if (tiktokResult?.platformPostId) {
        return { publishId: tiktokResult.platformPostId };
      }
    }
    // No TikTok publishId → modal closes via onClose() in TikTokPublishModal
    return undefined;
  };

  const rejectWithFeedback = async (feedback: string) => {
    setActionLoading('reject');
    try {
      const updated = await patch({
        status: 'rejected',
        ...(feedback.trim() ? { rejectionFeedback: feedback.trim() } : {}),
      });
      if (updated) setItem(updated);
      setRejectOpen(false);
    } finally { setActionLoading(null); }
  };

  const doDelete = async () => {
    setActionLoading('delete');
    try {
      await fetch(`/api/content/${item.id}`, { method: 'DELETE' });
      router.push('/dashboard/posts');
    } finally { setActionLoading(null); }
  };

  const reRoll = async () => {
    if (!campaign || campaign.reRollsRemaining <= 0) return;
    setActionLoading('reroll');
    try {
      const campaignRes = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reRollsRemaining: campaign.reRollsRemaining - 1 }),
      });
      if (campaignRes.ok) setCampaign((await campaignRes.json()).item);
      const res = await fetch(`/api/content/${item.id}/regenerate`, { method: 'POST' });
      if (res.ok) {
        const refresh = await fetch(`/api/content/${item.id}`);
        if (refresh.ok) setItem((await refresh.json()).item);
      }
    } finally { setActionLoading(null); }
  };

  const remix = () => {
    if (!item.templateId) return;
    router.push(`/dashboard/content/create?templateId=${item.templateId}`);
  };

  const retryPlatform = async (platform: string) => {
    setRetryingPlatform(platform);
    try {
      await fetch(`/api/content/${item.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: [platform] }),
      });
      const refresh = await fetch(`/api/content/${item.id}`);
      if (refresh.ok) {
        const j = await refresh.json();
        setItem(j.item);
        setPublications((j.publications as Publication[]) || []);
      }
    } finally { setRetryingPlatform(null); }
  };

  const isRejected = item.status === 'rejected';
  const isPublished = item.status === 'published';

  return (
    <>
      <PageHeader title="Content detail" />

      <div className="grid gap-4 pb-24 lg:grid-cols-3 lg:gap-6 lg:pb-6">
        {/* Left / main column */}
        <div className="space-y-4 lg:col-span-2">
          <DetailHeader item={item} editorHref={editorHref} />

          {isRejected && <RejectionPanel feedback={item.rejectionFeedback} />}

          {needsMedia && (
            <ContentPreview item={item} editorHref={editorHref} />
          )}

          <CaptionPanel
            caption={item.caption}
            hashtags={item.hashtags || []}
            onSave={saveCaption}
            isSaving={actionLoading === 'save'}
          />

          <EnrichmentPanel
            enrichment={enrichment}
            applied={item.enrichmentApplied || []}
          />

          {isPublished && (
            <EngagementPanel engagementData={item.engagementData || {}} />
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <div className="space-y-4 lg:sticky lg:top-4">
            <ActionsPanel
              status={item.status}
              canPublish={canPublish}
              hasScheduled={!!item.scheduledFor}
              campaignReRollsRemaining={campaign ? campaign.reRollsRemaining : null}
              hasTemplate={!!item.templateId}
              actionLoading={actionLoading}
              tiktokNeedsReview={effectiveHasTiktok && !pendingTiktokSettings && item.status === 'approved'}
              onApprove={() => updateStatus('approved')}
              onOpenReject={() => setRejectOpen(true)}
              onOpenDelete={() => setDeleteOpen(true)}
              onOpenSchedule={() => setScheduleOpenMobile(true)}
              onPublishNow={publishNow}
              onReRoll={campaign ? reRoll : undefined}
              onRemix={item.templateId ? remix : undefined}
            />

            {(item.status === 'approved' || item.status === 'scheduled' || scheduleOpenMobile) && (
              <SchedulePanel
                scheduledFor={item.scheduledFor}
                onSchedule={schedule}
                onPublishNow={publishNow}
                isBusy={actionLoading === 'schedule' || actionLoading === 'publish'}
                showPublishNow={item.status === 'scheduled'}
              />
            )}

            <PublishedToPanel
              publications={publications}
              onRetry={retryPlatform}
              isRetrying={retryingPlatform}
            />

            <DetailsPanel
              item={item}
              effectivePlatforms={effectivePlatforms}
              campaign={campaign}
              template={template}
              influencer={influencer}
              angle={angle}
            />
          </div>
        </div>
      </div>

      <MobileActionBar
        status={item.status}
        canPublish={canPublish}
        actionLoading={actionLoading}
        onApprove={() => updateStatus('approved')}
        onPublishNow={publishNow}
        onOpenReject={() => setRejectOpen(true)}
      />

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={rejectWithFeedback}
        isBusy={actionLoading === 'reject'}
      />
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={doDelete}
        captionPreview={item.caption}
        isBusy={actionLoading === 'delete'}
      />

      {/* TikTok Publish Modal — opens when TikTok needs per-platform review */}
      {effectiveHasTiktok && (
        <TikTokPublishModal
          isOpen={tiktokModalOpen}
          onClose={() => setTiktokModalOpen(false)}
          onPublish={handleTikTokPublish}
          contentItem={{
            id: item.id,
            caption: item.caption,
            contentType: item.contentType,
            videoDuration: undefined,
            videoUrl: (item.graphicUrls as string[] | undefined)?.[0],
          }}
          avatarUrl={tiktokAccountAvatar}
          remotionProps={tiktokRemotionProps}
        />
      )}
    </>
  );
}

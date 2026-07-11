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
import { renderEditorVideo } from '@/lib/editor/render-editor-video';
import type { ContentItem } from '@/types/v2';

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

  const [isRecompiling, setIsRecompiling] = useState(false);
  const [recompilePercent, setRecompilePercent] = useState(0);
  const [recompileStage, setRecompileStage] = useState<'rendering' | 'uploading'>('rendering');
  const [recompileError, setRecompileError] = useState<string | null>(null);

  const [retryingPlatform, setRetryingPlatform] = useState<string | null>(null);

  const editorHref = useMemo(() => `/dashboard/editor?contentItemId=${id}`, [id]);

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
    setActionLoading('publish');
    try {
      const res = await fetch(`/api/content/${item.id}/publish`, { method: 'POST' });
      if (res.ok) {
        const refreshRes = await fetch(`/api/content/${item.id}`);
        if (refreshRes.ok) {
          const j = await refreshRes.json();
          setItem(j.item);
          setPublications((j.publications as Publication[]) || []);
        }
      }
    } finally { setActionLoading(null); }
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

  const recompile = async () => {
    const ed = (item.enrichmentData || {}) as Record<string, any>;
    setIsRecompiling(true);
    setRecompilePercent(0);
    setRecompileStage('rendering');
    setRecompileError(null);
    try {
      const slots = resolveMediaSlots(item);
      const hasSlots = slots.background?.url || slots.hookVideo?.url || slots.demoVideo?.url
        || (slots.slides && slots.slides.length > 0);
      if (!hasSlots) {
        throw new Error('Cannot recompile. Original source media is missing. Re-open in the editor to reselect a background.');
      }
      const url = await renderEditorVideo(
        {
          script: ed.editorScript || {},
          style: ed.editorStyle || {},
          layout: ed.editorLayout || 'centered',
          aspectRatio: item.aspectRatio || '9:16',
          contentType: item.contentType,
          mediaSlots: slots,
          audioTrack: ed.audioTrack ?? null,
        },
        (percent, stage) => {
          setRecompilePercent(percent);
          setRecompileStage(stage);
        },
      );
      const updated = await patch({
        graphicUrls: [url],
        enrichmentData: { ...ed, isCompiled: true, compileError: null },
      });
      if (updated) setItem(updated);
    } catch (err) {
      setRecompileError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRecompiling(false);
    }
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
            <ContentPreview
              item={item}
              editorHref={editorHref}
              isRecompiling={isRecompiling}
              recompilePercent={recompilePercent}
              recompileStage={recompileStage}
              recompileError={recompileError}
              onRecompile={recompile}
            />
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
    </>
  );
}

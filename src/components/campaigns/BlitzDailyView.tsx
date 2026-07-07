"use client";

/**
 * BlitzDailyView — Tinder-style swipe queue for the daily Blitz.
 *
 * Behavior
 *   - Auto-generates today's queue on mount if empty (no more manual
 *     "Generate today's Blitz" button)
 *   - Renders remaining `pending_review` items as a swipeable card stack:
 *     the current item is the focus card; the next 2 sit behind it, scaled
 *     back so the user perceives depth
 *   - Two panels per card: personalized on the left (this item's caption +
 *     hero media), original template on the right (source it was cloned
 *     from — from templateId join)
 *   - Three actions per card: Reject (skip) / Edit (opens editor in
 *     `mode=blitz-edit` returning to /dashboard/blitz) / Approve (marks
 *     approved + navigates to detail page for scheduling)
 *   - Approvals/rejections leave the client-side queue immediately so the
 *     next card is always frictionless
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import type { Campaign, ContentItem } from '@/types/v2';
import { BlitzSettings } from '@/components/blitz/BlitzSettings';
import { RemotionPreviewPlayer } from '@/components/editor/RemotionPreviewPlayer';

type BlitzItem = ContentItem & {
  sequenceIndex?: number;
  scheduledDate?: string;
  scheduledTime?: string;
  isRolled?: boolean;
  angleName?: string | null;
};

type TemplateSummary = {
  id: string;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  contentType?: string | null;
  structure?: {
    hook?: string | null;
    body?: string | null;
    cta?: string | null;
  } | null;
  sourceCreator?: string | null;
  sourcePlatform?: string | null;
  viewCount?: number | null;
  likeCount?: number | null;
  shareCount?: number | null;
  commentCount?: number | null;
  durationSeconds?: number | null;
  thumbnailUrls?: string[] | null;
  slideCaptions?: string[] | null;
};

function formatCount(n?: number | null): string {
  if (!n || n < 1000) return String(n ?? 0);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// Content types that RemotionPreviewPlayer can render live. Keep in sync
// with COMPOSITION_BY_TYPE in src/components/editor/RemotionPreviewPlayer.tsx.
const LIVE_PREVIEW_TYPES = new Set([
  'slideshow',
  'carousel',
  'data_story',
  'wall_of_text',
  'talking_head',
  'green_screen',
  'video_hook',
  'ugc',
  'reel',
  'single_image',
]);

interface BlitzDailyViewProps {
  campaign: Campaign;
  initialContentItems: BlitzItem[];
}

const PENDING_STATUSES = new Set(['pending_review', 'draft', 'generating']);

export function BlitzDailyView({ campaign, initialContentItems }: BlitzDailyViewProps) {
  const router = useRouter();

  const [items, setItems] = useState<BlitzItem[]>(initialContentItems);
  const [templateCache, setTemplateCache] = useState<Record<string, TemplateSummary>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const autoGenAttempted = useRef(false);

  const queue = useMemo(
    () => items.filter((i) => PENDING_STATUSES.has(String(i.status || 'pending_review'))),
    [items],
  );
  const approvedCount = items.filter((i) => i.status === 'approved').length;
  const totalToday = items.length;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const loaded = (data.contentItems || []).map((cc: any) => ({
        ...(cc.contentItem || {}),
        angleName: cc.contentItem?.angleName || null,
        sequenceIndex: cc.sequenceIndex,
        scheduledDate: cc.scheduledDate
          ? new Date(cc.scheduledDate).toISOString().slice(0, 10)
          : undefined,
        scheduledTime: cc.scheduledTime,
        isRolled: cc.isRolled,
      }));
      setItems(loaded);
    } catch (err) {
      console.error('[Blitz] refresh failed', err);
    }
  }, [campaign.id]);

  const runGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      // POST /generate now returns 202 with { jobId } immediately — actual
      // work happens in the background cron worker. Poll the status endpoint
      // until the job reaches a terminal state, then refresh the queue.
      const res = await fetch(`/api/campaigns/${campaign.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate Blitz');
      }

      // Wait for the job to finish. Cap at ~5 minutes of polling (matches
      // Vercel maxDuration on the worker) so we don't spin forever if
      // something wedges — the campaigns list poller will keep the row's
      // progress bar accurate meanwhile.
      const started = Date.now();
      const MAX_WAIT_MS = 5 * 60 * 1000;
      let lastJob: any = null;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - started > MAX_WAIT_MS) {
          // Timed out client-side. Surface whatever the server last reported
          // so the user sees the real cause (stuck 'processing', engine
          // error, etc.) instead of a generic timeout string.
          const detail = lastJob?.errorMessage
            || (lastJob?.status === 'processing'
              ? `Still processing at step "${lastJob?.step ?? 'unknown'}" (${lastJob?.progress ?? 0}%). The engine may be slow or unreachable. Refresh in a minute.`
              : `Generation stalled at status "${lastJob?.status ?? 'unknown'}". Refresh to retry.`);
          throw new Error(detail);
        }
        await new Promise((r) => setTimeout(r, 2500));
        const statusRes = await fetch(
          `/api/campaigns/${campaign.id}/generate/status`,
          { cache: 'no-store' },
        );
        if (!statusRes.ok) continue;
        const statusData = await statusRes.json();
        const job = statusData?.job;
        if (!job) continue;
        lastJob = job;
        if (job.status === 'done') break;
        if (job.status === 'failed') {
          throw new Error(job.errorMessage || 'Generation failed');
        }
      }

      await refresh();
    } catch (err: any) {
      setError(err?.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [campaign.id, refresh]);

  // Auto-generate today's queue exactly once on mount if nothing is queued.
  useEffect(() => {
    if (autoGenAttempted.current) return;
    if (items.length > 0) return;
    autoGenAttempted.current = true;
    void runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lazily hydrate template summaries for the next few cards so the source
  // side of each card can render without a per-render fetch spin.
  useEffect(() => {
    const upcoming = queue.slice(0, 3);
    const missing = upcoming
      .map((it) => it.templateId)
      .filter((tid): tid is string => Boolean(tid) && !templateCache[tid!]);

    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const results: Record<string, TemplateSummary> = {};
      await Promise.all(
        missing.map(async (tid) => {
          try {
            const res = await fetch(`/api/templates/${tid}`, { cache: 'force-cache' });
            if (!res.ok) return;
            const data = await res.json();
            // `/api/templates/[id]` returns `{ item }`. Fall back to legacy
            // `{ template }` and to a bare object shape defensively so a
            // future response reshape doesn't silently blank the panel.
            const t = data.item || data.template || data;
            if (!t || !t.id) return;
            results[tid] = {
              id: t.id,
              mediaUrl: t.mediaUrl ?? null,
              thumbnailUrl: t.thumbnailUrl ?? null,
              contentType: t.contentType ?? null,
              structure: t.structure ?? null,
              sourceCreator: t.sourceCreator ?? null,
              sourcePlatform: t.sourcePlatform ?? null,
            };
          } catch {
            // Silent — the card falls back to a text-only source panel.
          }
        }),
      );
      if (cancelled) return;
      if (Object.keys(results).length > 0) {
        setTemplateCache((prev) => ({ ...prev, ...results }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queue, templateCache]);

  const removeFromQueue = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const patchStatus = async (itemId: string, status: string) => {
    const res = await fetch(`/api/content/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(`Status update failed (${res.status})`);
    return res.json();
  };

  const handleReject = async (item: BlitzItem) => {
    if (actionPending) return;
    setActionPending(item.id);
    setError(null);
    // Optimistic: drop immediately so the next card is instant.
    removeFromQueue(item.id);
    try {
      await patchStatus(item.id, 'skipped');
    } catch (err: any) {
      setError(err?.message || 'Reject failed');
      // Best-effort resync in case the server disagrees.
      await refresh();
    } finally {
      setActionPending(null);
    }
  };

  const handleEdit = (item: BlitzItem) => {
    if (actionPending) return;
    const returnTo = encodeURIComponent('/dashboard/blitz');
    router.push(
      `/dashboard/editor?contentItemId=${item.id}&mode=blitz-edit&returnTo=${returnTo}`,
    );
  };

  const handleApprove = async (item: BlitzItem) => {
    if (actionPending) return;
    setActionPending(item.id);
    setError(null);
    try {
      await patchStatus(item.id, 'approved');
      // Approve reuses the Schedule & Publish surface — send the user to
      // the content detail page where they finalize schedule / platforms.
      router.push(`/dashboard/content/${item.id}`);
    } catch (err: any) {
      setError(err?.message || 'Approve failed');
      setActionPending(null);
    }
  };

  const current = queue[0];
  const behind = queue.slice(1, 3);
  const queueDone = !current && !isGenerating;
  const currentTemplate = current?.templateId ? templateCache[current.templateId] : undefined;

  // Keyboard: left arrow rejects, right arrow approves the current card.
  // Skip when the settings drawer is open or focus is inside a form field so
  // we don't hijack typing.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
      if (actionPending) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        void handleReject(current);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        void handleApprove(current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, settingsOpen, actionPending]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Blitz</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Swipe through today&rsquo;s queue. Approve, edit, or reject each post.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            {approvedCount} approved
          </span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings2 className="size-4" />
            Settings
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded-md p-1 text-destructive/80 hover:bg-destructive/10"
            title="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Body */}
      {isGenerating && queue.length === 0 ? (
        <QueueLoading />
      ) : queueDone ? (
        <QueueDone
          total={totalToday}
          approved={approvedCount}
          onRegenerate={runGenerate}
          regenerating={isGenerating}
        />
      ) : current ? (
        <div className="mx-auto max-w-5xl">
          <div className="grid items-start gap-6 md:grid-cols-2">
            {/* LEFT: Remixed From (source template with TikTok phone chrome) */}
            <SourceTemplatePanel template={currentTemplate} />

            {/* RIGHT: Personalized card (swipe stack) */}
            <SwipeCard
              item={current}
              template={currentTemplate}
              behindCount={behind.length}
              actionPending={actionPending === current.id}
            />
          </div>

          {/* Centered action bar spanning both panels */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => handleReject(current)}
              disabled={actionPending === current.id}
              title="Reject"
              className="flex size-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              <X className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => handleEdit(current)}
              disabled={actionPending === current.id}
              className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              <Pencil className="size-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => handleApprove(current)}
              disabled={actionPending === current.id}
              title="Approve"
              className="flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition-colors hover:bg-emerald-600 disabled:opacity-60"
            >
              {actionPending === current.id ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <CheckCircle2 className="size-6" />
              )}
            </button>
          </div>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">{'\u2190'}</span>
            {' Reject   '}
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">{'\u2192'}</span>
            {' Approve'}
          </p>

          <QueueMeter position={items.length - queue.length + 1} total={items.length} />
        </div>
      ) : null}

      <BlitzSettings
        campaignId={campaign.id}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          setSettingsOpen(false);
          void refresh();
        }}
        initial={{
          contentMix: (campaign.contentMix ?? {}) as Record<string, number>,
          remixRatio: campaign.remixRatio ?? 50,
          angles: (campaign.angles ?? []) as { angleId: string; weight: number }[],
          mentionFrequency: campaign.mentionFrequency ?? 'sometimes',
          ownMediaMix: campaign.ownMediaMix ?? 50,
          pinterestPercent: (campaign as any).pinterestPercent ?? 0,
          influencerFrequency: campaign.influencerFrequency ?? 0,
          enabledInfluencerIds: ((campaign as any).enabledInfluencerIds ?? []) as string[],
          targetAccounts: (campaign.targetAccounts ?? []) as { accountId: string; platform: string }[],
          genderPreference: campaign.genderPreference ?? 'any',
          postsPerDay: campaign.postsPerDay ?? 3,
          qualityThreshold: campaign.qualityThreshold ?? 0.7,
        }}
      />
    </div>
  );
}

/* ─── Subcomponents ─────────────────────────────────────────────────── */

function QueueLoading() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
      <h3 className="text-base font-semibold text-foreground">Building today&rsquo;s queue</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        Picking trending templates, cloning them, and generating personalized copy for your brand.
      </p>
    </div>
  );
}

function QueueDone({
  total,
  approved,
  onRegenerate,
  regenerating,
}: {
  total: number;
  approved: number;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="size-7 text-emerald-500" />
      </div>
      <h3 className="text-base font-semibold text-foreground">You&rsquo;re done for today</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        {total > 0
          ? `You reviewed ${total} post${total === 1 ? '' : 's'}. ${approved} approved.`
          : 'No posts were generated for today yet.'}
      </p>
      <button
        onClick={onRegenerate}
        disabled={regenerating}
        className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={`size-4 ${regenerating ? 'animate-spin' : ''}`} />
        {regenerating ? 'Generating\u2026' : 'Generate more'}
      </button>
    </div>
  );
}

function QueueMeter({ position, total }: { position: number; total: number }) {
  if (total <= 0) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <span>
        Card {Math.min(position, total)} of {total}
      </span>
      <ArrowRight className="size-3 text-muted-foreground/60" />
    </div>
  );
}

function SwipeCard({
  item,
  template,
  behindCount = 0,
  actionPending: _actionPending,
}: {
  item: BlitzItem;
  template?: TemplateSummary;
  behindCount?: number;
  actionPending: boolean;
}) {
  const [whyOpen, setWhyOpen] = useState(false);

  const enrichment = (item.enrichmentData as any) || {};
  const isCompiled = enrichment.isCompiled === true;
  const compiledUrl = (item.graphicUrls || [])[0] || null;
  const isCompiledVideo = compiledUrl?.match(/\.(mp4|webm|mov)(\?|$)/i);

  // Live-preview eligibility: item has editor state OR its contentType maps
  // to a Remotion composition. Falls back to source template media so the
  // card is never black.
  const hasEditorState = !!(
    enrichment.editorScript
    || enrichment.editorStyle
    || enrichment.editorLayout
    || enrichment.sourceMediaSlots
  );
  const canLivePreview =
    !!item.contentType && LIVE_PREVIEW_TYPES.has(String(item.contentType));

  // Reshape sourceMediaSlots per the detail page pattern
  // (see src/app/[locale]/(auth)/dashboard/content/[id]/page.tsx:1180-1195).
  const sourceSlots = enrichment.sourceMediaSlots || {};
  const backgroundUrl = template?.mediaUrl || template?.thumbnailUrl || '';
  const mediaSlots = {
    background: sourceSlots.background || (backgroundUrl ? { url: backgroundUrl } : undefined),
    hookVideo: sourceSlots.hookVideo,
    demoVideo: sourceSlots.demoVideo,
    slides: sourceSlots.slides,
  };
  const livePreviewInputProps = {
    backgroundUrl,
    mediaSlots,
    script: enrichment.editorScript || {},
    style: enrichment.editorStyle || {},
    layout: enrichment.editorLayout || 'centered',
    aspectRatio: '9:16',
    contentType: item.contentType,
  };

  // Template media fallback (only used when neither compiled nor live-preview
  // paths are viable).
  const templateHero = template?.mediaUrl || template?.thumbnailUrl || null;
  const templateHeroIsVideo = templateHero?.match(/\.(mp4|webm|mov)(\?|$)/i);

  const captionLines = (item.caption || '').split('\n').filter(Boolean);

  // Derive a compact "Why This Content?" explanation from template
  // engagement + any reasoning stored on the item. No schema changes yet;
  // enrichment.reasoning is read opportunistically.
  const reasoningParts: string[] = [];
  if (enrichment.reasoning) reasoningParts.push(String(enrichment.reasoning));
  if (template?.viewCount && template.viewCount > 1000) {
    reasoningParts.push(
      `Modeled on a ${template.sourcePlatform || 'trending'} post with ${formatCount(template.viewCount)} views.`,
    );
  }
  if (item.angleName) reasoningParts.push(`Angle: ${item.angleName}.`);
  if (reasoningParts.length === 0) {
    reasoningParts.push('Selected from your active content mix and audience angles.');
  }

  return (
    <div className="flex flex-col">
      {/* Chip row above card */}
      <div className="mb-2 flex items-center justify-between gap-2">
        {item.contentType ? (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize text-foreground">
            {String(item.contentType).replace(/_/g, ' ')}
          </span>
        ) : (
          <span />
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Sparkles className="size-3" />
            Why This Content?
          </button>
          {whyOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-border bg-card p-3 text-xs text-foreground shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">Why we picked this</p>
                <button
                  type="button"
                  onClick={() => setWhyOpen(false)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="size-3" />
                </button>
              </div>
              <ul className="space-y-1.5 text-muted-foreground">
                {reasoningParts.map((r, i) => (
                  <li key={i} className="leading-snug">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Card body (aspect 9/16 to match phone frame) with stack-depth dummies behind */}
      <div className="relative mx-auto w-full max-w-[320px]">
        {behindCount >= 2 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl border border-border bg-card shadow-sm"
            style={{ transform: 'translateY(12px) scale(0.94)', opacity: 0.4 }}
          />
        )}
        {behindCount >= 1 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl border border-border bg-card shadow-sm"
            style={{ transform: 'translateY(6px) scale(0.97)', opacity: 0.7 }}
          />
        )}
      <div className="relative z-10 overflow-hidden rounded-2xl border border-border bg-neutral-900 shadow-lg">
        <div className="relative aspect-[9/16] max-h-[560px] w-full">
          {isCompiled && compiledUrl ? (
            isCompiledVideo ? (
              <video
                src={compiledUrl}
                className="size-full object-cover"
                muted
                loop
                playsInline
                autoPlay
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={compiledUrl}
                alt={item.caption?.slice(0, 60) || 'Blitz post'}
                className="size-full object-cover"
              />
            )
          ) : canLivePreview && (hasEditorState || backgroundUrl) ? (
            <RemotionPreviewPlayer
              contentType={String(item.contentType)}
              inputProps={livePreviewInputProps}
            />
          ) : templateHero ? (
            <>
              {templateHeroIsVideo ? (
                <video
                  src={templateHero}
                  className="size-full object-cover opacity-80"
                  muted
                  loop
                  playsInline
                  autoPlay
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={templateHero}
                  alt="Template preview"
                  className="size-full object-cover opacity-80"
                />
              )}
              <div className="absolute inset-x-3 top-3 flex justify-center">
                <span className="rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                  Compile pending
                </span>
              </div>
            </>
          ) : (
            <div className="flex size-full items-center justify-center text-sm text-white/60">
              No preview yet
            </div>
          )}

          {/* Angle chip (kept, overlaid) */}
          {item.angleName && (
            <span className="absolute left-3 top-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              {item.angleName}
            </span>
          )}
        </div>
      </div>
      </div>

      {/* Caption */}
      <div className="mt-4 max-h-40 overflow-y-auto rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground">
        {captionLines.length > 0 ? (
          captionLines.map((line, idx) => (
            <p key={idx} className={idx === 0 ? 'font-semibold' : 'mt-2 text-muted-foreground'}>
              {line}
            </p>
          ))
        ) : (
          <p className="text-muted-foreground">No caption yet.</p>
        )}
      </div>
    </div>
  );
}

function SourceTemplatePanel({ template }: { template?: TemplateSummary }) {
  // Slide index for multi-image slideshow templates. Wired to the side
  // arrows below the frame.
  const slides = template?.thumbnailUrls?.filter(Boolean) ?? [];
  const isSlideshow = slides.length > 1;
  const [slideIdx, setSlideIdx] = useState(0);

  // Reset index if we switch to a different template.
  useEffect(() => {
    setSlideIdx(0);
  }, [template?.id]);

  if (!template) {
    return (
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Remixed From
        </p>
        <div className="flex aspect-[9/16] max-h-[560px] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
          <Sparkles className="size-4 text-muted-foreground/60" />
          <span>No source template linked.</span>
        </div>
      </div>
    );
  }

  const activeSlide = isSlideshow ? slides[slideIdx] : null;
  const hero = activeSlide || template.mediaUrl || template.thumbnailUrl || null;
  const isVideo = !activeSlide && hero?.match(/\.(mp4|webm|mov)(\?|$)/i);

  const prevSlide = () => {
    if (!isSlideshow) return;
    setSlideIdx((i) => (i - 1 + slides.length) % slides.length);
  };
  const nextSlide = () => {
    if (!isSlideshow) return;
    setSlideIdx((i) => (i + 1) % slides.length);
  };

  return (
    <div className="flex flex-col">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Remixed From
      </p>

      {/* Phone bezel */}
      <div className="relative mx-auto w-full max-w-[320px] rounded-3xl border border-border bg-neutral-950 p-2 shadow-lg">
        <div className="relative aspect-[9/16] max-h-[560px] w-full overflow-hidden rounded-2xl bg-black">
          {/* Red TikTok-style status bar */}
          <div className="absolute inset-x-0 top-0 z-20 flex h-7 items-center justify-between bg-red-600 px-3 text-[10px] font-semibold text-white">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-3 rounded-sm bg-white/80" />
              <div className="h-1.5 w-3 rounded-sm bg-white/60" />
              <div className="h-2 w-4 rounded-sm border border-white/80" />
            </div>
          </div>

          {/* Media */}
          {hero ? (
            isVideo ? (
              <video src={hero} className="size-full object-cover" muted loop playsInline autoPlay />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt="Source template" className="size-full object-cover" />
            )
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-white/60">
              No source preview
            </div>
          )}

          {/* Engagement overlay (right edge, vertical) */}
          <div className="absolute bottom-6 right-3 z-20 flex flex-col items-center gap-4 text-white drop-shadow">
            <div className="flex flex-col items-center">
              <div className="flex size-9 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                <Heart className="size-4 fill-white text-white" />
              </div>
              <span className="mt-0.5 text-[10px] font-semibold">
                {formatCount(template.likeCount)}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex size-9 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                <MessageCircle className="size-4 text-white" />
              </div>
              <span className="mt-0.5 text-[10px] font-semibold">
                {formatCount(template.commentCount)}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex size-9 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                <Eye className="size-4 text-white" />
              </div>
              <span className="mt-0.5 text-[10px] font-semibold">
                {formatCount(template.viewCount)}
              </span>
            </div>
          </div>

          {/* Slideshow side arrows */}
          {isSlideshow && (
            <>
              <button
                type="button"
                onClick={prevSlide}
                className="absolute left-2 top-1/2 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
                aria-label="Previous slide"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={nextSlide}
                className="absolute right-2 top-1/2 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
                aria-label="Next slide"
              >
                <ChevronRight className="size-4" />
              </button>
            </>
          )}

          {/* Dot pagination */}
          {isSlideshow && (
            <div className="absolute inset-x-0 bottom-2 z-20 flex items-center justify-center gap-1.5">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className={`size-1.5 rounded-full ${i === slideIdx ? 'bg-white' : 'bg-white/40'}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Creator handle */}
      <div className="mt-3 text-center text-xs text-muted-foreground">
        {template.sourceCreator ? (
          <span className="font-medium text-foreground">@{template.sourceCreator}</span>
        ) : (
          <span>Trending source</span>
        )}
        {template.sourcePlatform && (
          <>
            {' \u00b7 '}
            <span className="capitalize">{template.sourcePlatform}</span>
          </>
        )}
      </div>
    </div>
  );
}

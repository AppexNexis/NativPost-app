'use client';

/**
 * BlitzDailyView — Tinder-style swipe queue for the daily Blitz.
 *
 * Rebuild (2026-07-07):
 *   - Single viewport, no page scroll — action bar always visible
 *   - Source panel (LEFT, phone frame + engagement counts) and personalized
 *     card (RIGHT, Remotion preview) sit tight next to each other
 *   - No caption text block below the card — the preview IS the content
 *   - No placeholder strings; missing sourceMediaSlots after Phase 1 is a
 *     system error, not a user-facing state
 *   - framer-motion swipe: drag right to approve, left to reject, keyboard
 *     arrows preserved as accessibility fallback
 *   - Empty states are ONLY: dailyLimitReached, NO_CONNECTED_CHANNELS,
 *     and queueDone. Blitz never surfaces a "no templates" state — when
 *     the library is empty the insert loop falls back to
 *     generateMediaForContentItem so posts still appear.
 */

import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  Pencil,
  Settings2,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BlitzSettings } from '@/components/blitz/BlitzSettings';
import { InlineEditorOverlay } from '@/components/editor/InlineEditorOverlay';
import { RemotionPreviewPlayer } from '@/components/editor/RemotionPreviewPlayer';
import { useBlitzPreviewProps } from '@/hooks/useBlitzPreviewProps';
import type { Campaign, ContentItem } from '@/types/v2';

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
  sourceCreator?: string | null;
  sourcePlatform?: string | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  thumbnailUrls?: Record<string, string> | string[] | null;
};

type GenerateOutcome =
  | { kind: 'none' }
  | { kind: 'dailyLimit'; count: number; limit: number; nextResetAt: string }
  | { kind: 'noChannels' };

function formatCount(n?: number | null): string {
  if (!n || n < 1000) {
    return String(n ?? 0);
  }
  if (n < 1_000_000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function parseSlideStrings(input: any): string[] {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input.filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  if (typeof input === 'object') {
    const keys = Object.keys(input);
    const allNumeric = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
    const orderedKeys = allNumeric ? keys.sort((a, b) => Number(a) - Number(b)) : keys;
    return orderedKeys
      .map(k => (input as Record<string, string>)[k])
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  return [];
}

const PENDING_STATUSES = new Set(['pending_review', 'draft', 'generating']);

type BlitzDailyViewProps = {
  campaign: Campaign;
  initialContentItems: BlitzItem[];
};

export function BlitzDailyView({ campaign, initialContentItems }: BlitzDailyViewProps) {
  const router = useRouter();

  const [items, setItems] = useState<BlitzItem[]>(initialContentItems);
  const [templateCache, setTemplateCache] = useState<Record<string, TemplateSummary>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<GenerateOutcome>({ kind: 'none' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [editingItem, setEditingItem] = useState<BlitzItem | null>(null);
  const autoGenAttempted = useRef(false);

  const queue = useMemo(
    () => items.filter(i => PENDING_STATUSES.has(String(i.status || 'pending_review'))),
    [items],
  );
  const approvedCount = items.filter(i => i.status === 'approved').length;
  const totalToday = items.length;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, { cache: 'no-store' });
      if (!res.ok) {
        return;
      }
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
    setOutcome({ kind: 'none' });
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));

      // The generate route now returns terminal empty states as 200
      // responses so the client can render distinct UI instead of a
      // generic error banner.
      if (data.errorCode === 'NO_CONNECTED_CHANNELS') {
        setOutcome({ kind: 'noChannels' });
        return;
      }
      if (data.dailyLimitReached) {
        setOutcome({
          kind: 'dailyLimit',
          count: data.count,
          limit: data.limit,
          nextResetAt: data.nextResetAt,
        });
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate Blitz');
      }

      // Job enqueued — poll status until terminal state.
      const started = Date.now();
      const MAX_WAIT_MS = 5 * 60 * 1000;
      let lastJob: any = null;

      while (true) {
        if (Date.now() - started > MAX_WAIT_MS) {
          const detail = lastJob?.errorMessage
            || (lastJob?.status === 'processing'
              ? `Still processing at step "${lastJob?.step ?? 'unknown'}" (${lastJob?.progress ?? 0}%). Refresh in a minute.`
              : `Generation stalled at status "${lastJob?.status ?? 'unknown'}". Refresh to retry.`);
          throw new Error(detail);
        }
        await new Promise(r => setTimeout(r, 2500));
        const statusRes = await fetch(
          `/api/campaigns/${campaign.id}/generate/status`,
          { cache: 'no-store' },
        );
        if (!statusRes.ok) {
          continue;
        }
        const statusData = await statusRes.json();
        const job = statusData?.job;
        if (!job) {
          continue;
        }
        lastJob = job;
        if (job.status === 'done') {
          break;
        }
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

  // Auto-generate today's queue once on mount if nothing is queued.
  useEffect(() => {
    if (autoGenAttempted.current) {
      return;
    }
    if (items.length > 0) {
      return;
    }
    autoGenAttempted.current = true;
    void runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate template summaries for the next few cards.
  useEffect(() => {
    const upcoming = queue.slice(0, 3);
    const missing = upcoming
      .map(it => it.templateId)
      .filter((tid): tid is string => Boolean(tid) && !templateCache[tid!]);

    if (missing.length === 0) {
      return;
    }

    let cancelled = false;
    (async () => {
      const results: Record<string, TemplateSummary> = {};
      await Promise.all(
        missing.map(async (tid) => {
          try {
            const res = await fetch(`/api/templates/${tid}`, { cache: 'force-cache' });
            if (!res.ok) {
              return;
            }
            const data = await res.json();
            const t = data.item || data.template || data;
            if (!t || !t.id) {
              return;
            }
            results[tid] = {
              id: t.id,
              mediaUrl: t.mediaUrl ?? null,
              thumbnailUrl: t.thumbnailUrl ?? null,
              contentType: t.contentType ?? null,
              sourceCreator: t.sourceCreator ?? null,
              sourcePlatform: t.sourcePlatform ?? null,
              viewCount: t.viewCount ?? null,
              likeCount: t.likeCount ?? null,
              commentCount: t.commentCount ?? null,
              thumbnailUrls: t.thumbnailUrls ?? null,
            };
          } catch {
            // Ignore; card falls back to enrichmentData.sourceMediaSlots.
          }
        }),
      );
      if (cancelled) {
        return;
      }
      if (Object.keys(results).length > 0) {
        setTemplateCache(prev => ({ ...prev, ...results }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queue, templateCache]);

  const removeFromQueue = (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  const patchStatus = async (itemId: string, status: string) => {
    const res = await fetch(`/api/content/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      throw new Error(`Status update failed (${res.status})`);
    }
    return res.json();
  };

  const handleReject = async (item: BlitzItem) => {
    if (actionPending) {
      return;
    }
    setActionPending(item.id);
    setError(null);
    removeFromQueue(item.id);
    try {
      await patchStatus(item.id, 'skipped');
    } catch (err: any) {
      setError(err?.message || 'Reject failed');
      await refresh();
    } finally {
      setActionPending(null);
    }
  };

  const handleEdit = (item: BlitzItem) => {
    if (actionPending) {
      return;
    }
    // Open the editor as an inline overlay on the Blitz page instead of
    // routing away. On Done, the updated item is merged into the local
    // queue in place so the swipe card refreshes without another fetch.
    setEditingItem(item);
  };

  // Swap an item in place in the local queue — used after inline edit Done
  // so the current Blitz card immediately reflects the new enrichmentData
  // without waiting for the next refresh tick.
  const mergeItemInPlace = useCallback((updated: ContentItem) => {
    setItems(prev => prev.map(it => (it.id === updated.id ? { ...it, ...(updated as BlitzItem) } : it)));
  }, []);

  const handleApprove = async (item: BlitzItem) => {
    if (actionPending) {
      return;
    }
    setActionPending(item.id);
    setError(null);
    try {
      await patchStatus(item.id, 'approved');
      router.push(`/dashboard/content/${item.id}`);
    } catch (err: any) {
      setError(err?.message || 'Approve failed');
      setActionPending(null);
    }
  };

  const current = queue[0];
  const behind = queue.slice(1, 3);
  const currentTemplate = current?.templateId ? templateCache[current.templateId] : undefined;

  // Reset slide index when the current card changes.
  useEffect(() => {
    setSlideIdx(0);
  }, [current?.id]);

  // While the top card is waiting on async media generation, poll refresh
  // every 5s. Root cause: `generateMediaForContentItem` in campaigns/utils.ts
  // is fire-and-forget (`.catch(...)` without await), so the campaign job
  // can flip to 'done' before sourceMediaSlots is populated. When that
  // happens the row shows up here with an empty preview — poll until the
  // media generator fills it in, or the user skips/approves.
  useEffect(() => {
    if (!current) {
      return;
    }
    const enrichment = (current.enrichmentData as any) || {};
    const slots = (enrichment.sourceMediaSlots as any) || {};
    const compiledUrl = (current.graphicUrls || [])[0] || null;
    const hasMedia
      = Boolean(slots.background?.url)
      || Boolean(slots.hookVideo?.url)
      || Boolean(slots.demoVideo?.url)
      || (Array.isArray(slots.slides) && slots.slides.length > 0)
      || Boolean(compiledUrl);
    if (hasMedia) {
      return;
    }
    const id = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [current, refresh]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (!current) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen) {
        return;
      }
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) {
        return;
      }
      if (actionPending) {
        return;
      }
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

  // Loading OR the outcome empty states short-circuit the card view.
  const queueDone = !current && !isGenerating && outcome.kind === 'none';
  const showLoading = isGenerating && queue.length === 0;

  return (
    <div className="flex h-[calc(100dvh-var(--header-h,64px))] flex-col overflow-hidden bg-background">
      {/* Header: compact, title only */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="size-4 text-primary" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Blitz</h1>
          {totalToday > 0 && (
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3 text-emerald-500" />
              {approvedCount}
              {' '}
              approved
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 className="size-4" />
          Settings
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 flex shrink-0 items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-6">
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

      {/* Body: fills remaining viewport, centers content */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 py-3 sm:px-6">
        {showLoading ? (
          <QueueLoading />
        ) : outcome.kind === 'noChannels' ? (
          <NoChannelsState />
        ) : outcome.kind === 'dailyLimit' ? (
          <DailyLimitState
            count={outcome.count}
            limit={outcome.limit}
            nextResetAt={outcome.nextResetAt}
          />
        ) : queueDone ? (
          <QueueDone total={totalToday} approved={approvedCount} />
        ) : current ? (
          <CardPair
            item={current}
            template={currentTemplate}
            behindCount={behind.length}
            actionPending={actionPending === current.id}
            slideIdx={slideIdx}
            onSlideIdxChange={setSlideIdx}
            onApprove={() => handleApprove(current)}
            onReject={() => handleReject(current)}
            onEdit={() => handleEdit(current)}
          />
        ) : null}
      </div>

      {editingItem && (
        <InlineEditorOverlay
          contentItemId={editingItem.id}
          onCancel={() => setEditingItem(null)}
          onDone={(updated) => {
            setEditingItem(null);
            if (updated) {
              mergeItemInPlace(updated);
            } else {
              void refresh();
            }
          }}
        />
      )}

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

/* ─── Card pair (source + personalized + action bar) ───────────────── */

function CardPair({
  item,
  template,
  behindCount,
  actionPending,
  slideIdx,
  onSlideIdxChange,
  onApprove,
  onReject,
  onEdit,
}: {
  item: BlitzItem;
  template?: TemplateSummary;
  behindCount: number;
  actionPending: boolean;
  slideIdx: number;
  onSlideIdxChange: (n: number) => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-4">
      <div className="flex w-full items-center justify-center gap-3 md:gap-4">
        <SourceTemplatePanel
          template={template}
          slideIdx={slideIdx}
          onSlideIdxChange={onSlideIdxChange}
        />
        <SwipeCard
          item={item}
          template={template}
          behindCount={behindCount}
          slideIdx={slideIdx}
          onSwipeApprove={onApprove}
          onSwipeReject={onReject}
        />
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={onReject}
          disabled={actionPending}
          title="Reject"
          className="flex size-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-colors hover:bg-red-600 disabled:opacity-50"
        >
          <X className="size-6" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={actionPending}
          className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <Pencil className="size-4" />
          Edit
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={actionPending}
          title="Approve"
          className="flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition-colors hover:bg-emerald-600 disabled:opacity-60"
        >
          {actionPending ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <CheckCircle2 className="size-6" />
          )}
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">{'\u2190'}</span>
        {' Reject   '}
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">{'\u2192'}</span>
        {' Approve'}
      </p>
    </div>
  );
}

/* ─── SwipeCard (personalized) ─────────────────────────────────────── */

function SwipeCard({
  item,
  template,
  behindCount,
  slideIdx,
  onSwipeApprove,
  onSwipeReject,
}: {
  item: BlitzItem;
  template?: TemplateSummary;
  behindCount: number;
  slideIdx: number;
  onSwipeApprove: () => void;
  onSwipeReject: () => void;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const previewProps = useBlitzPreviewProps({
    contentType: String(item.contentType),
    enrichmentData: item.enrichmentData,
    aspectRatio: item.aspectRatio || '9:16',
  });

  const enrichment = (item.enrichmentData as any) || {};
  const isCompiled = enrichment.isCompiled === true;
  const compiledUrl = (item.graphicUrls || [])[0] || null;
  const isCompiledVideo = compiledUrl?.match(/\.(mp4|webm|mov)(\?|$)/i);

  // For slideshow cards, wire slideIdx into the input props so the swipe
  // card and the source panel advance together.
  const inputPropsWithSlide = useMemo(() => {
    if (!previewProps) {
      return null;
    }
    return {
      ...previewProps.inputProps,
      slideIndex: slideIdx,
    };
  }, [previewProps, slideIdx]);

  // framer-motion drag physics.
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15]);
  const approveOpacity = useTransform(x, [0, 100], [0, 1]);
  const rejectOpacity = useTransform(x, [-100, 0], [1, 0]);

  const reasoningParts: string[] = [];
  if (enrichment.reasoning) {
    reasoningParts.push(String(enrichment.reasoning));
  }
  const snapshot = enrichment.sourceTemplateSnapshot || {};
  const views = snapshot.viewCount ?? template?.viewCount ?? null;
  const platform = snapshot.sourcePlatform || template?.sourcePlatform;
  if (views && views > 1000) {
    reasoningParts.push(
      `Modeled on a ${platform || 'trending'} post with ${formatCount(views)} views.`,
    );
  }
  if (item.angleName) {
    reasoningParts.push(`Angle: ${item.angleName}.`);
  }
  if (reasoningParts.length === 0) {
    reasoningParts.push('Selected from your active content mix and audience angles.');
  }

  return (
    <div className="flex w-[min(38vw,300px)] shrink-0 flex-col">
      {/* Chip row above card */}
      <div className="mb-2 flex min-h-[28px] items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {item.contentType && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium capitalize text-foreground">
              {String(item.contentType).replace(/_/g, ' ')}
            </span>
          )}
          {item.angleName && (
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
              {item.angleName}
            </span>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setWhyOpen(v => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Sparkles className="size-3" />
            Why?
          </button>
          {whyOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-border bg-card p-3 text-xs text-foreground shadow-xl">
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

      {/* Card body — stack with framer-motion swipe on the top card */}
      <div className="relative w-full">
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

        <AnimatePresence mode="popLayout">
          <motion.div
            key={item.id}
            className="relative z-10 aspect-[9/16] max-h-[min(65vh,560px)] w-full overflow-hidden rounded-2xl border border-border bg-neutral-900 shadow-lg"
            style={{ x, rotate }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.9}
            onDragEnd={(_, info) => {
              if (info.offset.x > 120) {
                onSwipeApprove();
              } else if (info.offset.x < -120) {
                onSwipeReject();
              }
            }}
            initial={{ scale: 0.96, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{
              x: x.get() > 0 ? 400 : -400,
              opacity: 0,
              transition: { duration: 0.28 },
            }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            {/* Approve / Reject stamps that fade in during drag */}
            <motion.div
              className="pointer-events-none absolute left-4 top-4 z-30 rounded-lg border-2 border-red-500 bg-red-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-500"
              style={{ opacity: rejectOpacity }}
            >
              Skip
            </motion.div>
            <motion.div
              className="pointer-events-none absolute right-4 top-4 z-30 rounded-lg border-2 border-emerald-500 bg-emerald-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-500"
              style={{ opacity: approveOpacity }}
            >
              Approve
            </motion.div>

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
            ) : previewProps && inputPropsWithSlide ? (
              <div className="size-full">
                <RemotionPreviewPlayer
                  contentType={previewProps.contentType}
                  inputProps={inputPropsWithSlide}
                />
              </div>
            ) : (
              // Preview media hasn't arrived yet — the campaign job flips
              // to 'done' before the async `generateMediaForContentItem`
              // fire-and-forget finishes for template-less items. The
              // parent polls every 5s until sourceMediaSlots fills in.
              <div className="flex size-full flex-col items-center justify-center px-4 text-center text-xs text-white/70">
                <Loader2 className="mb-3 size-6 animate-spin" />
                <span>Preparing preview…</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── SourceTemplatePanel (LEFT, TikTok phone frame) ───────────────── */

function SourceTemplatePanel({
  template,
  slideIdx,
  onSlideIdxChange,
}: {
  template?: TemplateSummary;
  slideIdx: number;
  onSlideIdxChange: (n: number) => void;
}) {
  const slides = useMemo(() => parseSlideStrings(template?.thumbnailUrls), [template?.thumbnailUrls]);
  const isSlideshow = slides.length > 1;
  const activeSlide = isSlideshow ? slides[Math.min(slideIdx, slides.length - 1)] : null;
  const hero = activeSlide || template?.mediaUrl || template?.thumbnailUrl || null;
  const isVideo = !activeSlide && hero?.match(/\.(mp4|webm|mov)(\?|$)/i);

  const prevSlide = () => {
    if (!isSlideshow) {
      return;
    }
    const next = (slideIdx - 1 + slides.length) % slides.length;
    onSlideIdxChange(next);
  };
  const nextSlide = () => {
    if (!isSlideshow) {
      return;
    }
    const next = (slideIdx + 1) % slides.length;
    onSlideIdxChange(next);
  };

  // Render a skeleton frame while the template summary hydrates so the
  // layout width stays stable — never render "No source template linked."
  return (
    <div className="flex w-[min(38vw,300px)] shrink-0 flex-col">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Remixed From
      </p>

      <div className="relative w-full rounded-3xl border border-border bg-neutral-950 p-1.5 shadow-lg">
        <div className="relative aspect-[9/16] max-h-[min(65vh,560px)] w-full overflow-hidden rounded-2xl bg-black">
          {/* Red status bar */}
          <div className="absolute inset-x-0 top-0 z-20 flex h-6 items-center justify-between bg-red-600 px-3 text-[10px] font-semibold text-white">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-3 rounded-sm bg-white/80" />
              <div className="h-1.5 w-3 rounded-sm bg-white/60" />
              <div className="h-2 w-4 rounded-sm border border-white/80" />
            </div>
          </div>

          {hero ? (
            isVideo ? (
              <video src={hero} className="size-full object-cover" muted loop playsInline autoPlay />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt="Source template" className="size-full object-cover" />
            )
          ) : (
            <div className="flex size-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-white/60" />
            </div>
          )}

          {/* Engagement rail */}
          {template && (
            <div className="absolute bottom-6 right-2.5 z-20 flex flex-col items-center gap-3.5 text-white drop-shadow">
              <div className="flex flex-col items-center">
                <div className="flex size-8 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                  <Heart className="size-3.5 fill-white text-white" />
                </div>
                <span className="mt-0.5 text-[10px] font-semibold">
                  {formatCount(template.likeCount)}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex size-8 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                  <MessageCircle className="size-3.5 text-white" />
                </div>
                <span className="mt-0.5 text-[10px] font-semibold">
                  {formatCount(template.commentCount)}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <div className="flex size-8 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                  <Eye className="size-3.5 text-white" />
                </div>
                <span className="mt-0.5 text-[10px] font-semibold">
                  {formatCount(template.viewCount)}
                </span>
              </div>
            </div>
          )}

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
              <div className="absolute inset-x-0 bottom-2 z-20 flex items-center justify-center gap-1.5">
                {slides.map((_, i) => (
                  <span
                    key={i}
                    className={`size-1.5 rounded-full ${i === slideIdx ? 'bg-white' : 'bg-white/40'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-2 text-center text-[11px] text-muted-foreground">
        {template?.sourceCreator ? (
          <span className="font-medium text-foreground">
            @
            {template.sourceCreator}
          </span>
        ) : (
          <span>Trending source</span>
        )}
        {template?.sourcePlatform && (
          <>
            {' \u00B7 '}
            <span className="capitalize">{template.sourcePlatform}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Empty states ─────────────────────────────────────────────────── */

function QueueLoading() {
  return (
    <div className="flex max-w-md flex-col items-center rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
      <h3 className="text-base font-semibold text-foreground">Building today&rsquo;s queue</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Cloning trending templates and personalizing copy for your brand.
      </p>
    </div>
  );
}

function QueueDone({ total, approved }: { total: number; approved: number }) {
  return (
    <div className="flex max-w-md flex-col items-center rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="size-7 text-emerald-500" />
      </div>
      <h3 className="text-base font-semibold text-foreground">You&rsquo;re done for today</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {total > 0
          ? `You reviewed ${total} post${total === 1 ? '' : 's'}. ${approved} approved.`
          : 'No posts left in the queue.'}
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        New posts unlock at midnight.
      </p>
    </div>
  );
}

function DailyLimitState({
  count,
  limit,
  nextResetAt,
}: {
  count: number;
  limit: number;
  nextResetAt: string;
}) {
  const resetDate = useMemo(() => {
    try {
      return new Date(nextResetAt).toLocaleString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        weekday: 'short',
      });
    } catch {
      return 'midnight';
    }
  }, [nextResetAt]);

  return (
    <div className="flex max-w-md flex-col items-center rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="size-7 text-emerald-500" />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        You&rsquo;ve reviewed today&rsquo;s Blitz
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        You&rsquo;ve seen
        {' '}
        {count}
        {' '}
        of
        {' '}
        {limit}
        {' '}
        posts scheduled for today.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        New posts unlock at
        {' '}
        {resetDate}
        .
      </p>
    </div>
  );
}

function NoChannelsState() {
  const router = useRouter();
  return (
    <div className="flex max-w-md flex-col items-center rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-amber-500/10">
        <LinkIcon className="size-6 text-amber-500" />
      </div>
      <h3 className="text-base font-semibold text-foreground">Connect a channel</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Connect Facebook, Instagram, or TikTok before generating Blitz posts.
      </p>
      <button
        type="button"
        onClick={() => router.push('/dashboard/social-accounts')}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <LinkIcon className="size-4" />
        Connect a channel
      </button>
    </div>
  );
}

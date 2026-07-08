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

import { motion, useAnimationControls, useMotionValue, useTransform } from 'framer-motion';
import {
  CheckCircle2,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Settings2,
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

type GenerateOutcome =
  | { kind: 'none' }
  | { kind: 'dailyLimit'; count: number; limit: number; nextResetAt: string }
  | { kind: 'noChannels' };

const PENDING_STATUSES = new Set(['pending_review', 'draft', 'generating']);

type BlitzDailyViewProps = {
  campaign: Campaign;
  initialContentItems: BlitzItem[];
};

export function BlitzDailyView({ campaign, initialContentItems }: BlitzDailyViewProps) {
  const router = useRouter();

  const [items, setItems] = useState<BlitzItem[]>(initialContentItems);
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<GenerateOutcome>({ kind: 'none' });
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        // Guard the poll against transient network failures — a brief
        // "Failed to fetch" mid-run shouldn't abort the whole generation.
        // The outer catch still surfaces if the initial POST itself failed.
        let statusRes: Response | null = null;
        try {
          statusRes = await fetch(
            `/api/campaigns/${campaign.id}/generate/status`,
            { cache: 'no-store' },
          );
        } catch (netErr) {
          console.warn('[Blitz] poll fetch failed, retrying:', netErr);
          continue;
        }
        if (!statusRes.ok) {
          continue;
        }
        let statusData: any = null;
        try {
          statusData = await statusRes.json();
        } catch {
          continue;
        }
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

  // Auto-generate today's queue once on mount if nothing is queued,
  // OR if all existing items have no enrichable media (stale items from
  // a previous failed generation before sourceMediaSlots were populated).
  useEffect(() => {
    if (autoGenAttempted.current) {
      return;
    }
    if (items.length > 0) {
      const anyHasMedia = items.some((i) => {
        const ed = (i.enrichmentData as any) || {};
        const slots = (ed.sourceMediaSlots as any) || {};
        return Boolean(slots.background?.url)
          || Boolean(slots.hookVideo?.url)
          || Boolean(slots.demoVideo?.url)
          || (Array.isArray(slots.slides) && slots.slides.length > 0);
      });
      if (anyHasMedia) {
        return; // at least one item has a valid preview — don't re-gen
      }
    }
    autoGenAttempted.current = true;
    void runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    try {
      await patchStatus(item.id, 'skipped');
      // Only remove from local queue AFTER the server confirms the skip.
      // Removing before causes a race: polling refresh() reloads the item
      // from the server before patchStatus commits, so the card reappears.
      removeFromQueue(item.id);
    } catch (err: any) {
      setError(err?.message || 'Reject failed');
      // Refresh to re-sync with the server in case the item was modified
      // by a concurrent operation.
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
      removeFromQueue(item.id);
      router.push(`/dashboard/content/${item.id}`);
    } catch (err: any) {
      setError(err?.message || 'Approve failed');
      setActionPending(null);
    }
  };

  const current = queue[0];
  const behind = queue.slice(1, 3);

  // While the top card is waiting on async media generation, poll refresh
  // every 5s. Skip polling while an action is in flight (swipe/skip in
  // progress) to avoid races between refresh() reloading the full queue
  // and the local optimistic state transition.
  useEffect(() => {
    if (!current) {
      return;
    }
    if (actionPending) {
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
  }, [current, actionPending, refresh]);

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
            current={current}
            behind={behind.slice(0, 2)}
            actionPending={actionPending === current.id}
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
  current,
  behind,
  actionPending,
  onApprove,
  onReject,
  onEdit,
}: {
  current: BlitzItem;
  behind: BlitzItem[];
  actionPending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex w-full flex-col items-center">
      {/* Swipe stack: one generated card at the top, ghost cards behind */}
      <CardDeck
        current={current}
        behind={behind}
        onApprove={onApprove}
        onReject={onReject}
      />

      {/* Action bar */}
      <div className="mt-4 flex items-center justify-center gap-4">
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

      <p className="mt-2 text-[11px] text-muted-foreground">
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">{'\u2190'}</span>
        {' Reject   '}
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">{'\u2192'}</span>
        {' Approve'}
      </p>
    </div>
  );
}

/* ─── CardDeck + SwipeCard (Tinder-style card stack) ────────────────── */

function CardDeck({
  current,
  behind,
  onApprove,
  onReject,
}: {
  current: BlitzItem;
  behind: BlitzItem[];
  onApprove: (item: BlitzItem) => void;
  onReject: (item: BlitzItem) => void;
}) {
  // Render top card + up to 2 behind cards as absolutely positioned layers.
  // BlitzSwipeCard handles its own exit animation via useAnimationControls
  // BEFORE calling the callback, so no AnimatePresence is needed here.
  const stack = useMemo(
    () => [current, ...behind.slice(0, 2)],
    [current, behind],
  );

  return (
    <div className="relative mx-auto aspect-[9/16] w-[min(40vw,300px)] max-h-[min(65vh,520px)]">
      {stack.map((card, idx) => {
        const isTop = idx === 0;
        return (
          <div
            key={card.id}
            className="absolute inset-0"
            style={{
              zIndex: stack.length - idx,
              transform: isTop
                ? undefined
                : `translateY(${idx * 8}px) scale(${1 - idx * 0.03})`,
            }}
          >
            <BlitzSwipeCard
              item={card}
              isTop={isTop}
              onSwipeApprove={isTop ? () => onApprove(card) : undefined}
              onSwipeReject={isTop ? () => onReject(card) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ─── BlitzSwipeCard ────────────────────────────────────────────────── */

function BlitzSwipeCard({
  item,
  isTop,
  onSwipeApprove,
  onSwipeReject,
}: {
  item: BlitzItem;
  isTop: boolean;
  onSwipeApprove?: () => void;
  onSwipeReject?: () => void;
}) {
  const controls = useAnimationControls();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-20, 0, 20]);
  const approveOpacity = useTransform(x, [0, 120], [0, 1]);
  const rejectOpacity = useTransform(x, [-120, 0], [1, 0]);

  // Reset motion values when the card identity changes so stamps don't
  // bleed through from the previous card's exit position.
  useEffect(() => {
    x.set(0);
    controls.set({ x: 0, opacity: 1 });
  }, [item.id, x, controls]);

  const previewProps = useBlitzPreviewProps({
    contentType: String(item.contentType),
    enrichmentData: item.enrichmentData,
    aspectRatio: item.aspectRatio || '9:16',
  });

  const enrichment = (item.enrichmentData as any) || {};
  const isCompiled = enrichment.isCompiled === true;
  const compiledUrl = (item.graphicUrls || [])[0] || null;
  const isCompiledVideo = compiledUrl?.match(/\.(mp4|webm|mov)(\?|$)/i);

  // Tinder/Bumble pattern: animate the card off screen FIRST, then fire
  // the callback. This avoids the race between the exit animation and the
  // parent removing the card from the array.
  const handleDragEnd = useCallback(
    async (_: any, info: any) => {
      const offset = info.offset.x;
      const velocity = info.velocity.x;

      if (offset > 80 || velocity > 500) {
        await controls.start({
          x: 500,
          opacity: 0,
          transition: { duration: 0.2, ease: 'easeOut' },
        });
        onSwipeApprove?.();
      } else if (offset < -80 || velocity < -500) {
        await controls.start({
          x: -500,
          opacity: 0,
          transition: { duration: 0.2, ease: 'easeOut' },
        });
        onSwipeReject?.();
      } else {
        controls.start({
          x: 0,
          rotate: 0,
          transition: { type: 'spring', stiffness: 300, damping: 20 },
        });
      }
    },
    [controls, onSwipeApprove, onSwipeReject],
  );

  return (
    <motion.div
      className="absolute inset-0 w-full overflow-hidden rounded-2xl border border-border bg-neutral-900 shadow-xl"
      style={{ x, rotate }}
      animate={controls}
      drag={isTop ? 'x' : undefined}
      dragConstraints={isTop ? { left: 0, right: 0 } : undefined}
      dragElastic={0.9}
      onDragEnd={isTop ? handleDragEnd : undefined}
    >
      {isTop && (
        <>
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
        </>
      )}

      {isCompiled && compiledUrl ? (
        isCompiledVideo ? (
          <video src={compiledUrl} className="size-full object-cover" muted loop playsInline autoPlay />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={compiledUrl} alt={item.caption?.slice(0, 60) || ''} className="size-full object-cover" />
        )
      ) : previewProps ? (
        <div className="size-full">
          <RemotionPreviewPlayer
            contentType={previewProps.contentType}
            inputProps={{ ...previewProps.inputProps, slideIndex: 0 }}
          />
        </div>
      ) : compiledUrl ? (
        isCompiledVideo ? (
          <video src={compiledUrl} className="size-full object-cover" muted loop playsInline autoPlay />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={compiledUrl} alt={item.caption?.slice(0, 60) || ''} className="size-full object-cover" />
        )
      ) : (
        <div className="flex size-full items-center justify-center">
          <Loader2 className="size-5 animate-spin text-white/60" />
        </div>
      )}
    </motion.div>
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

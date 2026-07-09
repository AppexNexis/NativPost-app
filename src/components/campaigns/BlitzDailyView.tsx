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
  ChevronLeft,
  ChevronRight,
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

// Session-storage key so the daily-limit state survives a page refresh.
// Without this, a user who exhausts their daily Blitz can refresh the
// page and the auto-generate + auto-refill effects kick in before the
// daily-limit useEffect, producing more posts past the limit.
const SESSION_KEY_DAILY_LIMIT = 'blitz_daily_limit';

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readSessionDailyLimit(campaignId: string): { count: number; limit: number; nextResetAt: string } | null {
  try {
    const raw = sessionStorage.getItem(`${SESSION_KEY_DAILY_LIMIT}_${campaignId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Only honor the stored limit if it's from today.
    if (parsed.dateKey !== getTodayKey()) return null;
    if (parsed.nextResetAt && new Date(parsed.nextResetAt) <= new Date()) return null;
    return { count: parsed.count, limit: parsed.limit, nextResetAt: parsed.nextResetAt };
  } catch {
    return null;
  }
}

function writeSessionDailyLimit(campaignId: string, count: number, limit: number, nextResetAt: string) {
  try {
    sessionStorage.setItem(
      `${SESSION_KEY_DAILY_LIMIT}_${campaignId}`,
      JSON.stringify({ dateKey: getTodayKey(), count, limit, nextResetAt }),
    );
  } catch { /* quota exceeded or private browsing — non-critical */ }
}

function getNextResetTime(): string {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0); // midnight reset (matches server generate/route.ts)
  return next.toISOString();
}

type BlitzDailyViewProps = {
  campaign: Campaign;
  initialContentItems: BlitzItem[];
  /** Server-side daily-limit check so the client gets the truth
   *  synchronously on mount. Without this the auto-gen effect fires
   *  before the client-side count effect, causing a spurious generation
   *  request. */
  dailyLimitReached?: boolean;
  dailyLimitCount?: number;
  dailyLimit?: number;
};

export function BlitzDailyView({
  campaign,
  initialContentItems,
  dailyLimitReached: serverDailyLimitReached,
  dailyLimitCount: serverDailyLimitCount,
  dailyLimit: serverDailyLimit,
}: BlitzDailyViewProps) {
  const router = useRouter();

  const [items, setItems] = useState<BlitzItem[]>(initialContentItems);
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<GenerateOutcome>({ kind: 'none' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BlitzItem | null>(null);
  const autoGenAttempted = useRef(false);

  const dailyLimit = serverDailyLimit || campaign.postsPerDay || 3;

  const queue = useMemo(
    () => items.filter(i => PENDING_STATUSES.has(String(i.status || 'pending_review'))),
    [items],
  );
  const approvedCount = items.filter(i => i.status === 'approved').length;
  const totalToday = items.length;

  // Derived (synchronous) daily-limit check so the auto-generate and
  // auto-refill effects can read it BEFORE the async daily-limit
  // useEffect fires. Uses the server-provided value first (most
  // reliable), then sessionStorage as a cross-refresh safety net,
  // then falls back to counting in-session items.
  const dailyLimitReached = useMemo(() => {
    // 1. Server-side authoritative check (passed as prop from page.tsx).
    //    This is the most reliable — the server queries the DB fresh on
    //    every page load, so it survives full refreshes, cleared cookies,
    //    and private browsing where sessionStorage is unavailable.
    if (serverDailyLimitReached && serverDailyLimitCount !== undefined && serverDailyLimit) {
      return {
        count: serverDailyLimitCount,
        limit: serverDailyLimit,
        nextResetAt: getNextResetTime(),
      };
    }
    // 2. SessionStorage safety net — survives page refresh.
    const stored = readSessionDailyLimit(campaign.id);
    if (stored && stored.count >= stored.limit) return stored;
    // 3. In-session fallback — count items in the current state.
    if (totalToday >= dailyLimit && queue.length === 0) {
      return { count: totalToday, limit: dailyLimit, nextResetAt: getNextResetTime() };
    }
    return null;
  }, [campaign.id, totalToday, dailyLimit, queue.length, serverDailyLimitReached, serverDailyLimitCount, serverDailyLimit]);

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
        writeSessionDailyLimit(campaign.id, data.count, data.limit, data.nextResetAt);
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
  // NEVER auto-generate when the daily limit is already reached — this
  // is the primary fix for the "refresh resets my limit" bug.
  // IMPORTANT: the items-exist check MUST come before the daily-limit
  // check. Otherwise refreshing the page with a full queue of generated
  // items shows "Daily limit reached" instead of the swipeable cards
  // (the user still needs to review/approve/reject them).
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
    // Daily limit already reached AND no items to review — show limit
    if (dailyLimitReached) {
      setOutcome({
        kind: 'dailyLimit',
        count: dailyLimitReached.count,
        limit: dailyLimitReached.limit,
        nextResetAt: dailyLimitReached.nextResetAt,
      });
      return;
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

      // If the queue is now empty AND the daily limit is hit, show the
      // daily-limit state immediately instead of triggering auto-refill
      // (which would call runGenerate → POST /generate → engine call →
      // 200s wait → possibly 504). This is the primary fix for the
      // "reject shows same post" bug.
      if (queue.length <= 1 && totalToday >= dailyLimit) {
        setOutcome({
          kind: 'dailyLimit',
          count: totalToday,
          limit: dailyLimit,
          nextResetAt: getNextResetTime(),
        });
      }
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

  // On mount, detect whether the daily limit is already exhausted so a
  // refresh never bypasses the limit. The server counts pending + approved
  // + skipped items against postsPerDay. Persists to sessionStorage so
  // the derived dailyLimitReached check survives a full page refresh.
  useEffect(() => {
    if (totalToday >= dailyLimit && queue.length === 0 && outcome.kind === 'none') {
      const nextResetAt = getNextResetTime();
      writeSessionDailyLimit(campaign.id, totalToday, dailyLimit, nextResetAt);
      setOutcome({
        kind: 'dailyLimit',
        count: totalToday,
        limit: dailyLimit,
        nextResetAt,
      });
    }
    // Only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refill: when the swipe queue drops below 2 cards, kick a new
  // batch. Both the server-side daily-limit gate and the client-side
  // totalToday guard prevent generating past postsPerDay — skipped items
  // consume the daily allowance alongside pending and approved.
  const refillRef = useRef(false);
  useEffect(() => {
    if (refillRef.current) return;
    if (isGenerating) return;
    if (actionPending) return;
    if (error) return;
    if (outcome.kind !== 'none') return;
    if (dailyLimitReached) return;
    if (queue.length >= 2) return;
    if (totalToday >= dailyLimit) return;
    refillRef.current = true;
    void runGenerate().finally(() => {
      refillRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, isGenerating, actionPending, outcome.kind, totalToday, error, dailyLimitReached, dailyLimit]);

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
          className="flex size-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-colors hover:bg-red-600 disabled:opacity-50 disabled:cursor-default"
        >
          <X className="size-6" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={actionPending}
          className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60 disabled:cursor-default"
        >
          <Pencil className="size-4" />
          Edit
        </button>
        <button
          type="button"
          onClick={onApprove}
          disabled={actionPending}
          title="Approve"
          className="flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition-colors hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-default"
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

  // Format content type label: "video_hook" → "Video Hook"
  const typeLabel = current
    ? String(current.contentType)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Content type label */}
      {typeLabel && (
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium capitalize text-foreground/70">
          {typeLabel}
        </span>
      )}
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

  const contentType = String(item.contentType);
  const enrichment = (item.enrichmentData as any) || {};
  const isCompiled = enrichment.isCompiled === true;
  const compiledUrl = (item.graphicUrls || [])[0] || null;
  const isCompiledVideo = compiledUrl?.match(/\.(mp4|webm|mov)(\?|$)/i);

  // Short brand message for the slideshow text overlay — NOT the full
  // post caption. The editorScript stores hookText as the short tagline
  // communicating media + brand; the full caption is for the social post.
  const hookText = enrichment.editorScript?.hookText
    || enrichment.script?.hookText
    || item.caption?.slice(0, 80)
    || '';

  // Slideshow/carousel: static slide rendering with prev/next arrows
  // instead of Remotion Player (which animates transitions and looks
  // like a video). The editor uses the same static slide pattern.
  const isSlideshowType = contentType === 'slideshow' || contentType === 'carousel' || contentType === 'data_story';
  const slides = (enrichment.sourceMediaSlots?.slides as { url: string }[]) || [];
  const [slideIdx, setSlideIdx] = useState(0);

  useEffect(() => {
    setSlideIdx(0);
  }, [item.id]);

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
      className="absolute inset-0 w-full overflow-hidden rounded-2xl border border-border bg-neutral-900 shadow-xl [cursor:grab] active:cursor-grabbing"
      style={{ x, rotate }}
      animate={controls}
      drag={isTop ? 'x' : undefined}
      dragConstraints={isTop ? { left: -400, right: 400 } : undefined}
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

      {/* The RemotionPreviewPlayer captures pointer events inside its
          canvas/controls, breaking the framer-motion drag on the motion.div.
          pointer-events-none on its container prevents this while leaving
          the motion.div's native drag handlers intact. Slideshow arrow
          buttons use pointer-events-auto + onPointerDown+stopPropagation
          which is safe. */}


      {/* ── Content-type-aware card preview ──
       * Priority:
       * 1. Slideshow / carousel / data_story → ALWAYS static slides with
       *    prev/next arrows, never as Remotion video. The content type
       *    determines the correct preview representation, NOT the compiled
       *    status. Even compiled slideshows render as static slides here.
       * 2. Compiled media (video/image) → final rendered output.
       * 3. RemotionPreviewPlayer → animated video previews (reel, vid_hook, etc.)
       * 4. Raw media fallback → graphicUrls[0] as video or image.
       * 5. Loading spinner → generation still in progress.
       *
       * ALL media branches must be wrapped in pointer-events-none so the
       * framer-motion drag on the parent motion.div works. Only the slide
       * nav arrows explicitly opt back in with pointer-events-auto.
       */}
      {isSlideshowType ? (
        <div className="pointer-events-none size-full">
          {slides.length > 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slides[slideIdx]?.url || ''}
                alt={`Slide ${slideIdx + 1}`}
                className="size-full object-cover"
              />

              {/* Slide dots */}
              <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-1.5">
                {slides.map((_, i) => (
                  <span
                    key={i}
                    className={`size-1.5 rounded-full transition-colors ${
                      i === slideIdx ? 'bg-white' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>

              {/* Prev/next arrows — only on the top card.
                  pointer-events-auto overrides the parent's pointer-events-none
                  so slide navigation still works while the card itself can be
                  dragged by framer-motion. */}
              {isTop && slides.length > 1 && (
                <>
                  <button
                    type="button"
                    className="pointer-events-auto absolute left-2 top-1/2 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSlideIdx((p) => (p - 1 + slides.length) % slides.length);
                    }}
                    aria-label="Previous slide"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="pointer-events-auto absolute right-2 top-1/2 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSlideIdx((p) => (p + 1) % slides.length);
                    }}
                    aria-label="Next slide"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </>
              )}
            </>
          ) : (
            // No slides available yet — show brand message text
            <div className="flex size-full items-center justify-center bg-neutral-800">
              {hookText ? (
                <p className="px-6 text-center text-sm leading-relaxed text-white/80">
                  {hookText}
                </p>
              ) : (
                <Loader2 className="size-5 animate-spin text-white/60" />
              )}
            </div>
          )}

          {/* Brand message overlay — short hook text, NOT the full caption */}
          {hookText && slides.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-3">
              <div className="mx-auto w-fit rounded-lg bg-black/60 px-4 py-2.5 text-sm leading-snug text-white backdrop-blur-sm">
                {hookText}
              </div>
            </div>
          )}
        </div>

      ) : isCompiled && compiledUrl ? (
        <div className="pointer-events-none size-full">
          {isCompiledVideo ? (
            <video src={compiledUrl} className="size-full object-cover" muted loop playsInline autoPlay />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={compiledUrl} alt={item.caption?.slice(0, 60) || ''} className="size-full object-cover" />
          )}
        </div>

      ) : previewProps ? (
        <div className="pointer-events-none size-full">
          <RemotionPreviewPlayer
            contentType={previewProps.contentType}
            inputProps={{ ...previewProps.inputProps, slideIndex: 0 }}
          />
        </div>

      ) : compiledUrl ? (
        <div className="pointer-events-none size-full">
          {isCompiledVideo ? (
            <video src={compiledUrl} className="size-full object-cover" muted loop playsInline autoPlay />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={compiledUrl} alt={item.caption?.slice(0, 60) || ''} className="size-full object-cover" />
          )}
        </div>

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

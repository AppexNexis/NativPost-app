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
  Eye,
  Heart,
  HelpCircle,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  Pencil,
  Settings2,
  Volume2,
  VolumeX,
  X,
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

// Compact number formatting (101K, 8.4M) for engagement metric chips.
function formatCompactNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

// Structured reasoning payload written by lib/blitz/build-editor-script.ts.
// Legacy rows may still have a plain string here; the WhyTooltip handles both.
type BlitzReasoning = {
  whyThisContent: string;
  angleName: string | null;
  topicLabel: string | null;
  sourceMetrics: { views: number | null; likes: number | null; comments: number | null } | null;
  sourceCreator: string | null;
  sourcePlatform: string | null;
};

// Read the source template snapshot regardless of which key path wrote it.
// Phase 1 (template-first insert) writes `templateSnapshot` with the full row.
// Phase 2/3 (engine + fallback) write `sourceTemplateSnapshot` with an expanded
// projection. Consumers must union both keys or Phase 2/3 rows silently miss
// the Remixed From panel.
function readSnapshot(enrichment: any): any {
  return enrichment?.templateSnapshot ?? enrichment?.sourceTemplateSnapshot ?? null;
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
      {/* Header: minimal — approved pill (left) + Settings (right) */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2 sm:px-6">
        <div className="flex items-center">
          {totalToday > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3 text-emerald-500" />
              {approvedCount}
              {' '}
              approved
            </span>
          ) : (
            <span aria-hidden className="h-6" />
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
  const enrichment = (current.enrichmentData as any) || {};
  const snapshot = readSnapshot(enrichment);
  const hasSourceMedia = Boolean(snapshot?.mediaUrl || snapshot?.thumbnailUrl);

  return (
    <div className="flex size-full flex-col items-center justify-between gap-2 py-1">
      {/* Card header — two pills row + Why This Content hover tooltip */}
      <CardHeader
        item={current}
        enrichment={enrichment}
        snapshot={snapshot}
      />

      {/* Main card row: Remixed From panel (LEFT) + swipe deck (RIGHT).
          Panel hides when snapshot has no media so the deck centers.
          flex-1 min-h-0 makes the row take remaining viewport height. */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 md:flex-row md:items-center md:gap-6">
        {hasSourceMedia && (
          <RemixedFromPanel snapshot={snapshot} />
        )}
        <CardDeck
          current={current}
          behind={behind}
          onApprove={onApprove}
          onReject={onReject}
        />
      </div>

      {/* Action bar — arrows under each swipe button (usefastlane parity) */}
      <div className="flex items-start justify-center gap-4 pt-1">
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onReject}
            disabled={actionPending}
            title="Reject"
            aria-label="Reject"
            className="flex size-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-colors hover:bg-red-600 disabled:opacity-50 disabled:cursor-default"
          >
            <X className="size-6" />
          </button>
          <kbd className="flex size-5 items-center justify-center rounded border border-border bg-muted font-mono text-[10px] text-muted-foreground">
            {'\u2190'}
          </kbd>
        </div>
        <div className="flex flex-col items-center gap-1 pt-1">
          <button
            type="button"
            onClick={onEdit}
            disabled={actionPending}
            className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-border bg-background px-6 text-sm font-medium text-foreground shadow-md transition-colors hover:bg-muted disabled:opacity-60 disabled:cursor-default"
          >
            <Pencil className="size-4" />
            Edit
          </button>
          <span className="h-5" aria-hidden />
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onApprove}
            disabled={actionPending}
            title="Approve"
            aria-label="Approve"
            className="flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition-colors hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-default"
          >
            {actionPending ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <CheckCircle2 className="size-6" />
            )}
          </button>
          <kbd className="flex size-5 items-center justify-center rounded border border-border bg-muted font-mono text-[10px] text-muted-foreground">
            {'\u2192'}
          </kbd>
        </div>
      </div>
    </div>
  );
}

/* ─── CardHeader (two pills + Why This Content hover tooltip) ───────── */

function CardHeader({
  item,
  enrichment,
  snapshot,
}: {
  item: BlitzItem;
  enrichment: any;
  snapshot: any;
}) {
  const typeLabel = item.contentType
    ? String(item.contentType).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  // Prefer the per-post topic label written at insert. Fall back to angleName
  // for legacy rows so older items still get a second pill when one exists.
  const topicLabel: string | null = enrichment.topicLabel || item.angleName || null;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {typeLabel && (
          <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium capitalize text-foreground/70">
            {typeLabel}
          </span>
        )}
        {topicLabel && (
          <span
            title={topicLabel}
            className="max-w-[240px] truncate rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300"
          >
            {topicLabel}
          </span>
        )}
      </div>
      <WhyTooltip enrichment={enrichment} snapshot={snapshot} />
    </div>
  );
}

/* ─── WhyTooltip — hover-triggered floating card, no layout push ─────── */

function WhyTooltip({ enrichment, snapshot }: { enrichment: any; snapshot: any }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delay-close so cursor can travel between the trigger and the panel
  // without the panel disappearing.
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Reasoning can be either the new structured object or a legacy string.
  const raw = enrichment.reasoning;
  const reasoning: Partial<BlitzReasoning> = typeof raw === 'object' && raw !== null
    ? raw
    : { whyThisContent: typeof raw === 'string' ? raw : 'Selected from your active content mix and audience angles.' };

  const views = reasoning.sourceMetrics?.views ?? snapshot?.viewCount ?? null;
  const likes = reasoning.sourceMetrics?.likes ?? snapshot?.likeCount ?? null;
  const comments = reasoning.sourceMetrics?.comments ?? snapshot?.commentCount ?? null;
  const hasMetrics = [views, likes, comments].some((n) => typeof n === 'number' && n > 0);

  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
        onMouseLeave={scheduleClose}
        onFocus={() => { cancelClose(); setOpen(true); }}
        onBlur={scheduleClose}
        onClick={() => setOpen((v) => !v)}
        aria-describedby="why-this-content-tooltip"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-3 py-0.5 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted"
      >
        <HelpCircle className="size-3" />
        Why This Content?
      </button>
      {open && (
        <div
          id="why-this-content-tooltip"
          role="tooltip"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="absolute left-1/2 top-full z-40 mt-2 w-72 -translate-x-1/2 rounded-2xl border border-border bg-background p-3 shadow-xl"
        >
          {/* Arrow */}
          <span
            aria-hidden
            className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-l border-t border-border bg-background"
          />
          <p className="text-xs leading-relaxed text-foreground">
            {reasoning.whyThisContent || 'Selected from your active content mix and audience angles.'}
          </p>
          {hasMetrics && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {typeof views === 'number' && views > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/80">
                  <Eye className="size-3" />
                  {formatCompactNumber(views)}
                </span>
              )}
              {typeof likes === 'number' && likes > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/80">
                  <Heart className="size-3" />
                  {formatCompactNumber(likes)}
                </span>
              )}
              {typeof comments === 'number' && comments > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/80">
                  <MessageCircle className="size-3" />
                  {formatCompactNumber(comments)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── RemixedFromPanel ──────────────────────────────────────────────── */

function RemixedFromPanel({ snapshot }: { snapshot: any }) {
  const mediaUrl: string | null = snapshot?.mediaUrl || snapshot?.thumbnailUrl || null;
  if (!mediaUrl) return null;

  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl);

  // Original hook text — first slide caption for slideshows, otherwise
  // the raw first slide entry. When the snapshot only has thumbnailUrls
  // we still show the mini preview but no overlay text.
  let originalHook: string | null = null;
  const slideCaptions = snapshot?.slideCaptions;
  if (Array.isArray(slideCaptions) && slideCaptions[0]) {
    originalHook = String(slideCaptions[0]).slice(0, 80);
  } else if (slideCaptions && typeof slideCaptions === 'object') {
    const first = Object.values(slideCaptions)[0];
    if (typeof first === 'string') originalHook = first.slice(0, 80);
  }

  const views = typeof snapshot?.viewCount === 'number' ? snapshot.viewCount : null;
  const likes = typeof snapshot?.likeCount === 'number' ? snapshot.likeCount : null;

  return (
    <div className="hidden w-[120px] shrink-0 flex-col items-start gap-1.5 md:flex md:w-[140px]">
      <span className="text-[11px] font-medium text-foreground/70">Remixed From</span>
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border/60 bg-neutral-900 shadow-lg">
        {isVideo ? (
          <video
            src={mediaUrl}
            className="absolute inset-0 size-full object-cover"
            muted
            loop
            playsInline
            autoPlay
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl} alt="Source template" className="absolute inset-0 size-full object-cover" />
        )}
        {originalHook && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-1.5">
            <div className="mx-auto w-fit max-w-[95%] rounded-md bg-black/60 px-1.5 py-1 text-[9px] leading-tight text-white backdrop-blur-sm">
              {originalHook}
            </div>
          </div>
        )}
        {/* Engagement chips overlaid bottom-right */}
        <div className="absolute inset-y-0 right-1 z-10 flex flex-col items-end justify-end gap-1 pb-2">
          {typeof likes === 'number' && likes > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
              <Heart className="size-2.5" />
              {formatCompactNumber(likes)}
            </span>
          )}
          {typeof views === 'number' && views > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
              <Eye className="size-2.5" />
              {formatCompactNumber(views)}
            </span>
          )}
        </div>
      </div>
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
    <div className="relative mx-auto aspect-[9/16] w-[min(70vw,260px)] max-h-[min(58vh,460px)] md:w-[min(38vw,300px)] md:max-h-[min(62vh,500px)]">
      {stack.map((card, idx) => {
        const isTop = idx === 0;
        // Alternating tilt for the ghost cards so the stack looks like a
        // shuffled deck rather than a stack of identical rectangles. Each
        // ghost also shifts down + slightly right and scales down.
        const tiltDeg = isTop ? 0 : (idx % 2 === 0 ? 3 : -3);
        return (
          <div
            key={card.id}
            className="absolute inset-0"
            style={{
              zIndex: stack.length - idx,
              transform: isTop
                ? undefined
                : `translateY(${idx * 6}px) translateX(${idx * 4}px) rotate(${tiltDeg}deg) scale(${1 - idx * 0.03})`,
              filter: isTop ? undefined : 'brightness(0.85)',
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

  // Audio state — defaults to muted so browsers allow autoplay. User
  // clicks the top-left toggle to unmute; state resets per-card so
  // stale audio from a previous swipe doesn't blast on the next card.
  const [muted, setMuted] = useState(true);

  // Reset motion values when the card identity changes so stamps don't
  // bleed through from the previous card's exit position.
  useEffect(() => {
    x.set(0);
    controls.set({ x: 0, opacity: 1 });
    setMuted(true);
  }, [item.id, x, controls]);

  // Memoize the argument so useBlitzPreviewProps's inner useMemo doesn't
  // recompute on every render. Without this the caller was passing a fresh
  // object literal each render, defeating the hook's memoization and
  // causing RemotionPreviewPlayer to re-mount briefly on every parent
  // re-render — visible as a "media loads then blank" flicker.
  const previewItem = useMemo(
    () => ({
      contentType: String(item.contentType),
      enrichmentData: item.enrichmentData,
      aspectRatio: item.aspectRatio || '9:16',
    }),
    [item.contentType, item.enrichmentData, item.aspectRatio],
  );
  const previewProps = useBlitzPreviewProps(previewItem);

  const contentType = String(item.contentType);
  const enrichment = (item.enrichmentData as any) || {};
  const isCompiled = enrichment.isCompiled === true;
  const compiledUrl = (item.graphicUrls || [])[0] || null;
  const isCompiledVideo = compiledUrl?.match(/\.(mp4|webm|mov)(\?|$)/i);
  // Fallback media for slideshow "no slides" case — show media from
  // templateSnapshot, graphicUrls, or enrichment source media, so hook
  // text never renders on a blank dark box.
  const fallbackMediaUrl = compiledUrl
    || (enrichment.templateSnapshot?.mediaUrl as string | undefined)
    || (enrichment.sourceMediaSlots?.background?.url as string | undefined)
    || null;
  // Check if fallbackMediaUrl is a video — separate from isCompiledVideo
  // because fallbackMediaUrl may differ from compiledUrl.
  const fallbackIsVideo = fallbackMediaUrl?.match(/\.(mp4|webm|mov)(\?|$)/i);

  // Short brand message for the slideshow text overlay — NOT the full
  // post caption. The editorScript stores hookText as the short tagline
  // communicating media + brand; the full caption is for the social post.
  const hookText = enrichment.editorScript?.hookText
    || enrichment.script?.hookText
    || item.caption?.slice(0, 80)
    || '';

  // Video content types where bodyText (longer caption) should display
  // as the primary text instead of the short hookText headline.
  const isVideoType = ['reel', 'video_hook', 'video_hook_demo', 'talking_head', 'green_screen', 'ugc'].includes(contentType);

  // Slideshow/carousel: static slide rendering with prev/next arrows
  // instead of Remotion Player (which animates transitions and looks
  // like a video). The editor uses the same static slide pattern.
  const isSlideshowType = contentType === 'slideshow' || contentType === 'carousel' || contentType === 'data_story';
  const slides = (enrichment.sourceMediaSlots?.slides as { url: string }[]) || [];
  const slideCopy: string[] = enrichment.editorScript?.slideCopy || [];
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
          {/* Audio mute toggle — top-left of the card. Only on the top
              card so ghost cards behind stay silent. pointer-events-auto
              wins over the pointer-events-none media wrapper below. */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              setMuted((v) => !v);
            }}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="pointer-events-auto absolute left-3 top-3 z-30 flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
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
            // No slides available — show hook text over a fallback
            // background (rawSource, graphicUrls[0] or compiled), never a
            // blank dark box. When the user clicks Edit they see the media
            // because the editor session loads the full template.
            <div className="relative size-full bg-neutral-800">
              {fallbackMediaUrl && (
                fallbackIsVideo
                  ? <video src={fallbackMediaUrl} className="absolute inset-0 size-full object-cover" muted={muted} loop playsInline autoPlay />
                  : <img src={fallbackMediaUrl} alt="" className="absolute inset-0 size-full object-cover" />
              )}
              {hookText && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-3">
                  <div className="mx-auto w-fit max-w-[90%] rounded-lg bg-black/60 px-4 py-2.5 text-sm leading-snug text-white backdrop-blur-sm">
                    {hookText}
                  </div>
                </div>
              )}
              {!fallbackMediaUrl && !hookText && (
                <div className="flex size-full items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-white/60" />
                </div>
              )}
            </div>
          )}

          {/* Per-slide caption text — each slide gets its own caption from
              editorScript.slideCopy, matching the Image Editor behavior.
              Falls back to hookText (brand message) when slideCopy is empty. */}
          {slides.length > 0 && (slideCopy[slideIdx] || hookText) && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-3">
              <div className="mx-auto w-fit max-w-[90%] rounded-lg bg-black/60 px-4 py-2.5 text-sm leading-snug text-white backdrop-blur-sm">
                {slideCopy[slideIdx] || hookText}
              </div>
            </div>
          )}
        </div>

      ) : isCompiled && compiledUrl ? (
        <div className="pointer-events-none size-full">
          {isCompiledVideo ? (
            <video src={compiledUrl} className="size-full object-cover" muted={muted} loop playsInline autoPlay />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={compiledUrl} alt={item.caption?.slice(0, 60) || ''} className="size-full object-cover" />
          )}
        </div>

      ) : previewProps ? (
        <RemotionPreviewSlot
          previewProps={previewProps}
          isVideoType={isVideoType}
        />

      ) : compiledUrl ? (
        <div className="pointer-events-none relative size-full">
          {isCompiledVideo ? (
            <video src={compiledUrl} className="size-full object-cover" muted={muted} loop playsInline autoPlay />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={compiledUrl} alt={item.caption?.slice(0, 60) || ''} className="size-full object-cover" />
          )}
          {/* Text overlay for compiled videos — shows hook/body text on
              the video so UGC and other compiled videos aren't textless.
              Clips to 90 chars for consistent card density. */}
          {hookText && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-3">
              <div className="mx-auto w-fit max-w-[90%] rounded-lg bg-black/60 px-4 py-2.5 text-sm leading-snug text-white backdrop-blur-sm">
                {hookText.slice(0, 90)}
              </div>
            </div>
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

/* ─── RemotionPreviewSlot — stabilises inputProps for RemotionPreviewPlayer.
 * The player mounts once per contentType change; script rewrite for video
 * types is derived + memoized inside instead of computed inline in JSX
 * (which was recreating the whole object every render and forcing a
 * remount — visible as the "media loads then blank" flicker).
 */
function RemotionPreviewSlot({
  previewProps,
  isVideoType,
}: {
  previewProps: NonNullable<ReturnType<typeof useBlitzPreviewProps>>;
  isVideoType: boolean;
}) {
  const finalInputProps = useMemo(() => {
    const base = previewProps.inputProps;
    const script = base?.script as any;
    const bodyText: string | undefined = script?.bodyText;
    const clippedBody = bodyText && bodyText.length > 90
      ? `${bodyText.slice(0, 90).trimEnd()}...`
      : bodyText;
    if (isVideoType && clippedBody) {
      return {
        ...base,
        script: {
          ...script,
          hookText: clippedBody,
          bodyText: undefined,
        },
        slideIndex: 0,
      };
    }
    return { ...base, slideIndex: 0 };
  }, [previewProps.inputProps, isVideoType]);

  return (
    <div className="pointer-events-none size-full">
      <RemotionPreviewPlayer
        contentType={previewProps.contentType}
        inputProps={finalInputProps}
      />
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

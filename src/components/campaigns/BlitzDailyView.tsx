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
  Loader2,
  Pencil,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import type { Campaign, ContentItem } from '@/types/v2';
import { BlitzSettings } from '@/components/blitz/BlitzSettings';

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
};

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
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - started > MAX_WAIT_MS) {
          throw new Error('Generation is taking longer than expected. Refresh to check status.');
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Swipe stack (personalized) */}
          <div className="relative">
            <StackDepthPreview items={behind} />
            <SwipeCard
              item={current}
              actionPending={actionPending === current.id}
              onReject={() => handleReject(current)}
              onEdit={() => handleEdit(current)}
              onApprove={() => handleApprove(current)}
            />
            <QueueMeter position={items.length - queue.length + 1} total={items.length} />
          </div>

          {/* Source template (original) */}
          <SourceTemplatePanel
            template={current.templateId ? templateCache[current.templateId] : undefined}
          />
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
          ? `You reviewed ${total} post${total === 1 ? '' : 's'} — ${approved} approved.`
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
    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
      <span>
        Card {Math.min(position, total)} of {total}
      </span>
      <span className="inline-flex items-center gap-1 text-muted-foreground/80">
        Swipe or use the buttons below
        <ArrowRight className="size-3" />
      </span>
    </div>
  );
}

function StackDepthPreview({ items }: { items: BlitzItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 -z-0">
      {items.map((it, idx) => {
        const offset = (idx + 1) * 12;
        const scale = 1 - (idx + 1) * 0.03;
        return (
          <div
            key={it.id}
            className="absolute inset-0 rounded-2xl border border-border bg-card/70 shadow-sm"
            style={{
              transform: `translateY(${offset}px) scale(${scale})`,
              opacity: 0.7 - idx * 0.2,
            }}
          />
        );
      })}
    </div>
  );
}

function SwipeCard({
  item,
  actionPending,
  onReject,
  onEdit,
  onApprove,
}: {
  item: BlitzItem;
  actionPending: boolean;
  onReject: () => void;
  onEdit: () => void;
  onApprove: () => void;
}) {
  const heroUrl = (item.graphicUrls || [])[0] || null;
  const isVideo = heroUrl?.match(/\.(mp4|webm|mov)(\?|$)/i);
  const captionLines = (item.caption || '').split('\n').filter(Boolean);

  return (
    <div className="relative z-10 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-neutral-900">
        {heroUrl ? (
          isVideo ? (
            <video
              src={heroUrl}
              className="size-full object-cover"
              muted
              loop
              playsInline
              autoPlay
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroUrl}
              alt={item.caption?.slice(0, 60) || 'Blitz post'}
              className="size-full object-cover"
            />
          )
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-white/60">
            No preview yet
          </div>
        )}

        {/* Angle chip */}
        {item.angleName && (
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
            {item.angleName}
          </span>
        )}
        {/* Content-type chip */}
        {item.contentType && (
          <span className="absolute right-3 top-3 rounded-full bg-primary/90 px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
            {String(item.contentType).replace(/_/g, ' ')}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-5">
        <div className="max-h-40 overflow-y-auto text-sm leading-relaxed text-foreground">
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

        <div className="mt-1 flex items-center justify-between gap-3">
          <button
            onClick={onReject}
            disabled={actionPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <X className="size-4" />
            Reject
          </button>
          <button
            onClick={onEdit}
            disabled={actionPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Pencil className="size-4" />
            Edit
          </button>
          <button
            onClick={onApprove}
            disabled={actionPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {actionPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

function SourceTemplatePanel({ template }: { template?: TemplateSummary }) {
  if (!template) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
        <Sparkles className="size-4 text-muted-foreground/60" />
        <span>No source template linked.</span>
      </div>
    );
  }

  const hero = template.thumbnailUrl || template.mediaUrl || null;
  const isVideo = hero?.match(/\.(mp4|webm|mov)(\?|$)/i);
  const s = template.structure || {};

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Original template
        </p>
        <p className="mt-0.5 text-sm text-foreground">
          {template.sourceCreator ? `@${template.sourceCreator}` : 'Trending source'}
          {template.sourcePlatform ? ` · ${template.sourcePlatform}` : ''}
        </p>
      </div>

      <div className="relative aspect-[9/16] max-h-[420px] w-full bg-neutral-900">
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
      </div>

      <div className="flex flex-col gap-2 p-4 text-xs">
        {s.hook && (
          <div>
            <p className="font-semibold text-muted-foreground">Hook</p>
            <p className="mt-0.5 text-foreground">{s.hook}</p>
          </div>
        )}
        {s.body && (
          <div>
            <p className="font-semibold text-muted-foreground">Body</p>
            <p className="mt-0.5 text-foreground/90">{s.body}</p>
          </div>
        )}
        {s.cta && (
          <div>
            <p className="font-semibold text-muted-foreground">CTA</p>
            <p className="mt-0.5 text-foreground">{s.cta}</p>
          </div>
        )}
        {!s.hook && !s.body && !s.cta && (
          <p className="text-muted-foreground">No structure captured for this template.</p>
        )}
      </div>
    </aside>
  );
}

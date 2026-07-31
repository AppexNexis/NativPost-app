'use client';

import { addDays, format, isSameDay, isToday, parseISO, startOfDay, startOfWeek } from 'date-fns';
import {
  CalendarDays,
  Check,
  Info,
  LayoutGrid,
  List,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import React, { useState } from 'react';

// The caption overlay + overlay-text resolution are shared with the posts grid
// so a campaign card and a posts card can never drift from each other — or from
// the blitz / content-detail previews they both mirror.
import { getOverlayText, HighlightCaption } from '@/components/content/preview-helpers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useInView } from '@/hooks/useInView';
import { mapWithConcurrency } from '@/lib/concurrency';
import type { Campaign, ContentItem } from '@/types/v2';

import { CampaignPostEditModal } from './CampaignPostEditModal';

// ── Platform icon ─────────────────────────────────────────────────────────────
function PlatformIcon({ platform }: { platform: string }) {
  const p = platform.toLowerCase();
  if (p === 'youtube') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-4 fill-red-600">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      </span>
    );
  }
  if (p === 'instagram') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 shadow-sm">
        <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
        </svg>
      </span>
    );
  }
  if (p === 'tiktok') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-black shadow-sm">
        <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.79a4.85 4.85 0 0 1-1-.1z" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-blue-600 shadow-sm">
      <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    </span>
  );
}

// ── Thumbnail resolver ────────────────────────────────────────────────────────
// Tries multiple data sources to find the best image URL for a card preview.
// Avoids returning video URLs (mp4/webm/mov) since those can't display in <img>.
const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const VIDEO_CONTENT_TYPES = new Set(['ugc', 'talking_head', 'video_hook_demo', 'video_hook', 'green_screen', 'green_screen_meme']);

function getThumb(item: ReviewItem): string | null {
  const enrichment = (item.enrichmentData ?? {}) as Record<string, any>;
  const mediaSlots = (enrichment.sourceMediaSlots ?? {}) as Record<string, any>;
  const snapshot = (enrichment.templateSnapshot ?? {}) as Record<string, any>;

  // 1. For image-kind (slideshow/carousel): first slide image
  const slides = mediaSlots.slides;
  if (Array.isArray(slides) && slides.length > 0) {
    const url = slides[0]?.url;
    if (url && typeof url === 'string' && !VIDEO_RE.test(url)) {
      return url;
    }
  }

  // 2. Template snapshot thumbnailUrl (usually a CDN image)
  if (snapshot.thumbnailUrl && typeof snapshot.thumbnailUrl === 'string' && !VIDEO_RE.test(snapshot.thumbnailUrl)) {
    return snapshot.thumbnailUrl;
  }

  // 3. Template snapshot thumbnailUrls array/object
  const tus = snapshot.thumbnailUrls;
  if (Array.isArray(tus) && tus.length > 0 && typeof tus[0] === 'string') {
    return tus[0];
  }
  if (tus && typeof tus === 'object' && !Array.isArray(tus)) {
    const first = Object.values(tus)[0];
    if (typeof first === 'string' && !VIDEO_RE.test(first)) {
      return first;
    }
  }

  // 4. Background slot: check explicit thumbnailUrl, then image-only url
  const bg = (mediaSlots.background ?? {}) as Record<string, any>;
  if (bg.thumbnailUrl && typeof bg.thumbnailUrl === 'string' && !VIDEO_RE.test(bg.thumbnailUrl)) {
    return bg.thumbnailUrl;
  }
  if (bg.url && bg.assetType !== 'video' && !VIDEO_RE.test(bg.url)) {
    return bg.url;
  }

  // 5. hookVideo / demoVideo thumbnail images
  const hookVid = (mediaSlots.hookVideo ?? {}) as Record<string, any>;
  if (hookVid.thumbnailUrl && typeof hookVid.thumbnailUrl === 'string' && !VIDEO_RE.test(hookVid.thumbnailUrl)) {
    return hookVid.thumbnailUrl;
  }
  const demoVid = (mediaSlots.demoVideo ?? {}) as Record<string, any>;
  if (demoVid.thumbnailUrl && typeof demoVid.thumbnailUrl === 'string' && !VIDEO_RE.test(demoVid.thumbnailUrl)) {
    return demoVid.thumbnailUrl;
  }

  // 6. graphicUrls — skip video URLs
  const gUrl = item.graphicUrls?.[0];
  if (gUrl && typeof gUrl === 'string' && !VIDEO_RE.test(gUrl)) {
    return gUrl;
  }

  return null;
}

// Returns the raw video URL for video-type content (used for hover autoplay).
function getVideoUrl(item: ReviewItem): string | null {
  const enrichment = (item.enrichmentData ?? {}) as Record<string, any>;
  const mediaSlots = (enrichment.sourceMediaSlots ?? {}) as Record<string, any>;
  const bg = (mediaSlots.background ?? {}) as Record<string, any>;
  if (bg.url && (bg.assetType === 'video' || VIDEO_RE.test(String(bg.url)))) {
    return String(bg.url);
  }
  const hookVid = (mediaSlots.hookVideo ?? {}) as Record<string, any>;
  if (hookVid.url && VIDEO_RE.test(String(hookVid.url))) {
    return String(hookVid.url);
  }
  const snapshot = (enrichment.templateSnapshot ?? {}) as Record<string, any>;
  const srcUrl = snapshot.sourceUrl || snapshot.mediaUrl;
  if (srcUrl && typeof srcUrl === 'string' && VIDEO_RE.test(srcUrl)) {
    return srcUrl;
  }
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// The calendar is always a 7-column week, never "however many days the campaign
// happens to run".
const WEEK_COLUMNS = 'repeat(7, minmax(0, 1fr))';
// How many posts a day cell lists before the rest move behind "+N more".
const DAY_PREVIEW_LIMIT = 3;

// Week grid vs. chronological list. Both render the same campaign; which one
// leads depends on how the campaign is shaped (see `isBurst`).
type CalendarMode = 'week' | 'agenda';

// Never-throw date coercion for the calendar view. date-fns parseISO throws a
// TypeError when handed a non-string (e.g. a Date object) and format() throws a
// RangeError on an Invalid Date — either blanks the whole calendar with an
// unhandled render error. Blitz campaigns uniquely hit this: the grid view
// never reads campaign.startDate, but the calendar does, and the wizard's local
// campaign object can carry startDate as a Date rather than a yyyy-MM-dd string
// (the static type says string, but the runtime value diverges). This helper
// accepts string | Date | number | null and never throws.
function toDate(v: unknown): Date | null {
  if (!v) {
    return null;
  }
  try {
    const d = typeof v === 'string' ? parseISO(v) : new Date(v as string | number | Date);
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

// ── Content type label ────────────────────────────────────────────────────────
function ctLabel(contentType: string | null | undefined): string {
  if (!contentType) {
    return '—';
  }
  return contentType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type ReviewItem = ContentItem & {
  sequenceIndex?: number;
  scheduledDate?: string;
  scheduledTime?: string;
  isRolled?: boolean;
  angleName?: string;
  angleColor?: string;
};

type CampaignReviewGridProps = {
  campaign: Campaign;
  contentItems: ReviewItem[];
  onEdit: (itemId: string) => void;
  onReRoll: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  // Returns a promise from the wizard, which PATCHes and then updates local
  // state. Typed as `void` before, which threw that promise away — so "Approve
  // all" had no way to know when the work finished.
  onApprove: (itemId: string) => void | Promise<void>;
  onSkip?: (itemId: string) => void;
  onScheduleChange: (itemId: string, date: string, time: string) => void;
  onItemUpdated?: (updated: ContentItem) => void;
};

// ── Root component ────────────────────────────────────────────────────────────
export function CampaignReviewGrid({
  campaign,
  contentItems,
  onReRoll,
  onDelete,
  onApprove,
  onSkip,
  onScheduleChange,
  onItemUpdated,
}: CampaignReviewGridProps) {
  const [view, setView] = useState<'grid' | 'calendar'>('grid');
  const [editingItem, setEditingItem] = useState<ReviewItem | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  const reRolls = campaign.reRollsRemaining ?? 0;

  // ── Bulk approve ────────────────────────────────────────────────────────
  const approvedCount = contentItems.filter(i => i.status === 'approved').length;
  const pendingApproval = contentItems.filter(i => i.status !== 'approved');
  const allApproved = contentItems.length > 0 && pendingApproval.length === 0;

  const handleApproveAll = async () => {
    if (isApprovingAll || pendingApproval.length === 0) {
      return;
    }
    setIsApprovingAll(true);
    try {
      // Only the ones that still need it — the old handler looped EVERY item
      // and re-approved posts that were already approved.
      //
      // Bounded concurrency because this is one HTTP PATCH per post: a
      // 300-post campaign firing them all at once would hammer the API and
      // the connection pool. Settled, not all-or-nothing, so one failure
      // doesn't abandon the rest.
      await mapWithConcurrency(pendingApproval, 6, item => Promise.resolve(onApprove(item.id)));
    } finally {
      setIsApprovingAll(false);
    }
  };

  // Derive platforms from the campaign's target accounts
  const campaignPlatforms = Array.from(
    new Set(
      ((campaign.targetAccounts ?? []) as { accountId: string; platform: string }[])
        .map(a => a.platform)
        .filter(Boolean),
    ),
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <h3 className="text-heading">Review your campaign</h3>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${reRolls <= 3 ? 'text-destructive' : 'text-foreground'}`}>
              {reRolls}
              {' '}
              re-rolls left
            </span>
            <div className="flex overflow-hidden rounded-lg border">
              <Button
                variant={view === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none px-2.5"
                onClick={() => setView('grid')}
                title="Grid view"
              >
                <LayoutGrid className="size-4" />
              </Button>
              <Separator orientation="vertical" className="h-8" />
              <Button
                variant={view === 'calendar' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none px-2.5"
                onClick={() => setView('calendar')}
                title="Calendar view"
              >
                <CalendarDays className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* ── View ── */}
        {view === 'grid' ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {contentItems.map(item => (
              <PostCard
                key={item.id}
                item={item}
                campaignPlatforms={campaignPlatforms}
                canReRoll={reRolls > 0}
                onEdit={() => setEditingItem(item)}
                onReRoll={() => reRolls > 0 && onReRoll(item.id)}
                onDelete={() => onDelete(item.id)}
                onApprove={() => onApprove(item.id)}
                onSkip={onSkip ? () => onSkip(item.id) : undefined}
                onScheduleChange={(d, t) => onScheduleChange(item.id, d, t)}
              />
            ))}
          </div>
        ) : (
          <CalendarView
            contentItems={contentItems}
            campaign={campaign}
            campaignPlatforms={campaignPlatforms}
            canReRoll={reRolls > 0}
            onEdit={(id) => {
              const it = contentItems.find(i => i.id === id);
              if (it) {
                setEditingItem(it);
              }
            }}
            onReRoll={id => reRolls > 0 && onReRoll(id)}
            onDelete={onDelete}
            onApprove={onApprove}
            onScheduleChange={onScheduleChange}
          />
        )}

        {/* ── Bulk approve ── */}
        <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
          <span className="text-body text-muted-foreground">
            {approvedCount}
            {' '}
            /
            {contentItems.length}
            {' '}
            approved
          </span>

          {/* Once everything is approved there is nothing left to do, so the
              action is replaced by its result. Previously the button stayed
              live and unchanged at 7/7, so clicking it re-approved already
              approved posts and gave no sign anything had happened. */}
          {allApproved
            ? (
                <span className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-emerald-600">
                  <Check className="size-4" />
                  All approved
                </span>
              )
            : (
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={isApprovingAll || pendingApproval.length === 0}
                  onClick={handleApproveAll}
                >
                  {isApprovingAll
                    ? (
                        <>
                          <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                          Approving…
                        </>
                      )
                    : (
                        <>
                          <Check className="mr-1.5 size-3.5" />
                          Approve
                          {' '}
                          {pendingApproval.length}
                        </>
                      )}
                </Button>
              )}
        </div>
      </div>

      {/* ── Edit modal ── */}
      {editingItem && (
        <CampaignPostEditModal
          campaignId={campaign.id}
          contentItem={editingItem}
          reRollsRemaining={reRolls}
          onCancel={() => setEditingItem(null)}
          onSaved={(updated) => {
            onItemUpdated?.(updated);
            setEditingItem(null);
          }}
        />
      )}
    </TooltipProvider>
  );
}

// ── Schedule picker ───────────────────────────────────────────────────────────
function SchedulePicker({
  date,
  time,
  onChange,
}: {
  date?: string;
  time?: string;
  onChange: (date: string, time: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Same never-throw coercion the calendar view uses: the picker renders in both
  // views, so a Date-typed or malformed scheduledDate here would take the whole
  // grid down the way it used to take down the calendar.
  const selected = toDate(date) ?? undefined;

  const label = selected
    ? `${format(selected, 'MMM d')}${time ? `, ${time}` : ''}`
    : 'Set schedule';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground">
          <CalendarDays className="size-3" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            if (day) {
              onChange(format(day, 'yyyy-MM-dd'), time ?? '09:00');
            }
          }}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <Separator />
        <div className="flex items-center gap-2 p-3">
          <label className="text-meta text-muted-foreground">Time</label>
          <input
            type="time"
            defaultValue={time ?? '09:00'}
            onChange={e => onChange(date ?? format(new Date(), 'yyyy-MM-dd'), e.target.value)}
            className="flex-1 rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <Button size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Info popover ──────────────────────────────────────────────────────────────
function InfoPopover({ item, campaignPlatforms }: { item: ReviewItem; campaignPlatforms: string[] }) {
  const enrichment = (item.enrichmentData ?? {}) as Record<string, unknown>;
  const contentType = ctLabel(item.contentType ?? (enrichment.contentType as string));
  const angle = item.angleName ?? String((enrichment.angleName as string) ?? '—');

  // Show ALL campaign platforms (from targetAccounts), not just item-level field
  const platforms = campaignPlatforms.length > 0
    ? campaignPlatforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')
    : Array.isArray(item.targetPlatforms) && item.targetPlatforms.length > 0
      ? item.targetPlatforms.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')
      : '—';

  const scheduledOn = toDate(item.scheduledDate);
  const scheduledLabel = scheduledOn
    ? `${format(scheduledOn, 'EEE, MMM d')}${item.scheduledTime ? `, ${item.scheduledTime}` : ''}`
    : 'Unscheduled';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-full border border-white/30 bg-white/80 backdrop-blur-sm hover:bg-white"
          onClick={e => e.stopPropagation()}
        >
          <Info className="size-3.5 text-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3 text-xs" align="end" side="bottom">
        <div className="space-y-1.5">
          <InfoRow label="Type" value={contentType} />
          <InfoRow label="Angle" value={angle} />
          <InfoRow label="Platforms" value={platforms} />
          <InfoRow label="Status" value={item.status ?? '—'} />
          <InfoRow label="Scheduled" value={scheduledLabel} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────
function PostCard({
  item,
  campaignPlatforms,
  canReRoll,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onSkip,
  onScheduleChange,
}: {
  item: ReviewItem;
  campaignPlatforms: string[];
  canReRoll: boolean;
  onEdit: () => void;
  onReRoll: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onSkip?: () => void;
  onScheduleChange: (date: string, time: string) => void;
}) {
  const thumb = getThumb(item);
  const videoUrl = getVideoUrl(item);
  const isVideoType = VIDEO_CONTENT_TYPES.has(item.contentType ?? '');
  const approved = item.status === 'approved';
  // Show first campaign platform icon (most relevant)
  const primaryPlatform = campaignPlatforms[0] ?? (Array.isArray(item.targetPlatforms) ? String(item.targetPlatforms[0] ?? '') : '');
  const angleColor = item.angleColor ?? '#f97316';
  const typeLabel = item.contentType ? ctLabel(item.contentType) : null;
  const overlayText = getOverlayText(item);
  // Gate the <video> on viewport intersection. A long campaign — or the day
  // view, which can open 19 cards at once — otherwise mounts that many decoders
  // simultaneously. Same treatment the posts grid gives its cards.
  const [cardRef, inView] = useInView<HTMLDivElement>({ rootMargin: '200px', once: false });

  return (
    <div ref={cardRef} className={`overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md ${approved ? 'ring-2 ring-emerald-400' : ''}`}>
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] cursor-pointer overflow-hidden bg-muted" onClick={onEdit}>
        {isVideoType && videoUrl && inView ? (
        /* Video type: autoplay muted loop (matches usefastlane grid) */

          <video
            src={videoUrl}
            poster={thumb ?? undefined}
            className="size-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : thumb ? (
          // Use plain <img> to avoid Next.js domain restrictions with template CDN URLs
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={item.caption?.slice(0, 40) ?? 'Post'}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground/30">
            <svg className="size-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {typeLabel && <span className="text-[9px]">{typeLabel}</span>}
          </div>
        )}

        {/* Platform badge */}
        {primaryPlatform && (
          <div className="absolute left-2 top-2 z-10">
            <PlatformIcon platform={primaryPlatform} />
          </div>
        )}

        {/* Info popover */}
        <div className="absolute right-2 top-2 z-10">
          <InfoPopover item={item} campaignPlatforms={campaignPlatforms} />
        </div>

        {/* Approved chip */}
        {approved && (
          <div className="absolute left-2 top-10 z-10">
            <Badge className="bg-emerald-500 px-1.5 py-0 text-[9px] text-white">Approved</Badge>
          </div>
        )}

        {/* Caption overlay — rendered exactly like the editor / blitz / detail
            page: per-line highlight box + authored font/color/align/weight from
            enrichmentData.editorStyle (WYSIWYG with the published post). */}
        {overlayText && <HighlightCaption item={item} />}

        {/* Content type pill */}
        {typeLabel && !approved && (
          <div className="absolute bottom-8 left-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[8px] font-semibold text-white">
            {typeLabel}
          </div>
        )}

        {/* Angle pill */}
        {item.angleName && (
          <div
            className="absolute inset-x-2 bottom-2 z-10 truncate rounded-full px-2 py-0.5 text-center text-[8px] font-semibold text-white"
            style={{ backgroundColor: angleColor }}
          >
            {item.angleName}
          </div>
        )}
      </div>

      {/* Below-image details */}
      <div className="space-y-1.5 p-2.5">
        {/* Caption */}
        <button type="button" onClick={onEdit} className="group flex w-full items-start gap-1 text-left">
          <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-foreground group-hover:text-primary">
            {item.caption ?? ''}
          </p>
          <Pencil className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </button>

        {/* Schedule picker */}
        <SchedulePicker
          date={item.scheduledDate}
          time={item.scheduledTime}
          onChange={onScheduleChange}
        />

        {/* Actions */}
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onEdit}>
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onReRoll} disabled={!canReRoll}>
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Re-roll</TooltipContent>
          </Tooltip>

          {!approved && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="size-7 p-0 text-muted-foreground hover:text-emerald-600" onClick={onApprove}>
                  <Check className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Approve</TooltipContent>
            </Tooltip>
          )}

          {onSkip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onSkip}>
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <polygon points="5 4 15 12 5 20 5 4" />
                    <line x1="19" y1="5" x2="19" y2="19" />
                  </svg>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Skip</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto size-7 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────
function CalendarView({
  contentItems,
  campaign,
  campaignPlatforms,
  canReRoll,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onScheduleChange,
}: {
  contentItems: ReviewItem[];
  campaign: Campaign;
  campaignPlatforms: string[];
  canReRoll: boolean;
  onEdit: (id: string) => void;
  onReRoll: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onScheduleChange: (itemId: string, date: string, time: string) => void;
}) {
  // The day whose full post list is open in the day view, if any.
  const [openDay, setOpenDay] = useState<Date | null>(null);
  // null = follow the campaign shape (see `isBurst` below). Once the user picks
  // a mode explicitly we stop overriding them.
  const [modeOverride, setModeOverride] = useState<CalendarMode | null>(null);

  // Derive the actual date range from the scheduled posts, not from
  // campaignLengthDays which may be stale or capped to 7. Every parseISO is
  // followed by a validity check because date-fns v4 throws RangeError on
  // format() when given an Invalid Date, which used to blow up the whole view.
  const isValidDate = (d: Date | null | undefined): d is Date =>
    d instanceof Date && !Number.isNaN(d.getTime());

  const scheduledDates = contentItems
    .map(it => toDate(it.scheduledDate))
    .filter(isValidDate);

  const campaignStart = toDate(campaign.startDate);

  const earliestDate = scheduledDates.length > 0
    ? scheduledDates.reduce((a, b) => (a < b ? a : b))
    : (campaignStart ?? new Date());

  const latestDate = scheduledDates.length > 0
    ? scheduledDates.reduce((a, b) => (a > b ? a : b))
    : addDays(earliestDate, (campaign.campaignLengthDays ?? 7) - 1);

  // Use campaign start date if it precedes the first scheduled post
  const start = campaignStart && campaignStart < earliestDate ? campaignStart : earliestDate;

  // Cap totalDays to a sane window so a stray far-future date can't blow up
  // the render with a multi-thousand-cell grid.
  const rawTotalDays = Math.ceil((latestDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const totalDays = Number.isFinite(rawTotalDays) && rawTotalDays > 0
    ? Math.min(rawTotalDays, 90)
    : Math.max(1, (campaign.campaignLengthDays ?? 7));

  // Lay the range out on a REAL week grid — snapped back to the Sunday of the
  // first week and padded forward to a whole number of weeks. Packing "days
  // since start" into rows of 7 instead meant the column count tracked the
  // campaign length, so a Blitz that schedules every post on one day rendered
  // as a single full-width column of giant cards. Every week is 7 columns now;
  // days outside the campaign range render as muted spacers.
  const gridStart = startOfWeek(start, { weekStartsOn: 0 });
  const leadingDays = Math.max(0, Math.round((start.getTime() - gridStart.getTime()) / DAY_MS));
  const paddedDays = Math.ceil((leadingDays + totalDays) / 7) * 7;

  const weeks: Date[][] = [];
  for (let i = 0; i < paddedDays; i += 7) {
    weeks.push(Array.from({ length: 7 }, (_, d) => addDays(gridStart, i + d)));
  }

  const firstDay = start;
  const lastDay = addDays(start, totalDays - 1);
  const inRange = (day: Date) =>
    day.getTime() >= startOfDay(firstDay).getTime()
    && day.getTime() <= startOfDay(lastDay).getTime();

  const getItems = (day: Date) =>
    contentItems
      .filter((it) => {
        const d = toDate(it.scheduledDate);
        return isValidDate(d) && isSameDay(d, day);
      })
      // Chronological within the day — a Blitz posts several times a day and the
      // order it publishes in is the order you want to review it in.
      .sort((a, b) => (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''));

  // A Blitz schedules its whole run on one or two days, where a week grid is
  // six empty columns and one crowded one. Default those to the agenda and let
  // multi-day campaigns keep the grid — until the user picks, then honour that.
  const isBurst = totalDays <= 2;
  const mode: CalendarMode = modeOverride ?? (isBurst ? 'agenda' : 'week');
  const rangeDays = Array.from({ length: totalDays }, (_, i) => addDays(start, i));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {format(start, 'MMM d')}
          {' '}
          –
          {format(latestDate, 'MMM d, yyyy')}
          {' '}
          ·
          {contentItems.length}
          {' '}
          posts
        </p>

        <div className="flex overflow-hidden rounded-lg border">
          <Button
            variant={mode === 'week' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 rounded-none px-2.5 text-xs"
            onClick={() => setModeOverride('week')}
          >
            <CalendarDays className="mr-1.5 size-3.5" />
            Week
          </Button>
          <Separator orientation="vertical" className="h-7" />
          <Button
            variant={mode === 'agenda' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 rounded-none px-2.5 text-xs"
            onClick={() => setModeOverride('agenda')}
          >
            <List className="mr-1.5 size-3.5" />
            Agenda
          </Button>
        </div>
      </div>

      {mode === 'agenda' && (
        <AgendaView
          days={rangeDays}
          getItems={getItems}
          campaignPlatforms={campaignPlatforms}
          canReRoll={canReRoll}
          onEdit={onEdit}
          onReRoll={onReRoll}
          onDelete={onDelete}
          onApprove={onApprove}
          onScheduleChange={onScheduleChange}
        />
      )}

      {mode === 'week' && (
        <ScrollArea className="w-full">
          <div className="min-w-[600px] space-y-3 pb-2">
            {weeks.map((week, wi) => (
              <div key={wi}>
                {/* Day name headers — only first week */}
                {wi === 0 && (
                  <div className="mb-1 grid gap-2" style={{ gridTemplateColumns: WEEK_COLUMNS }}>
                    {week.map((day, di) => (
                      <div key={di} className="text-center text-micro font-semibold text-muted-foreground">
                        {format(day, 'EEE')}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-2" style={{ gridTemplateColumns: WEEK_COLUMNS }}>
                  {week.map((day, di) => {
                    const dayItems = getItems(day);
                    const today = isToday(day);
                    const active = inRange(day);
                    return (
                      <div
                        key={di}
                        className={`min-h-[140px] rounded-xl border p-2 ${
                          !active
                            ? 'border-dashed border-border/40 bg-transparent'
                            : today
                              ? 'border-primary/50 bg-primary/5'
                              : 'border-border bg-muted/20'
                        }`}
                      >
                        {/* Date number — a button once the day has posts, so the
                          whole cell has one obvious way into the day view. */}
                        <div className="mb-2 flex justify-center">
                          {dayItems.length > 0
                            ? (
                                <button
                                  type="button"
                                  onClick={() => setOpenDay(day)}
                                  className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                                    today
                                      ? 'bg-primary text-primary-foreground'
                                      : 'text-foreground hover:bg-muted'
                                  }`}
                                  aria-label={`Open ${format(day, 'EEEE, MMMM d')} · ${dayItems.length} posts`}
                                >
                                  {format(day, 'd')}
                                </button>
                              )
                            : (
                                <span
                                  className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                                    today
                                      ? 'bg-primary text-primary-foreground'
                                      : active
                                        ? 'text-muted-foreground'
                                        : 'text-muted-foreground/30'
                                  }`}
                                >
                                  {format(day, 'd')}
                                </span>
                              )}
                        </div>

                        {/* Compact event rows, not full cards. A Blitz can land
                          its whole run on one day; the cell stays scannable and
                          the overflow goes to the day view. */}
                        <div className="space-y-1">
                          {dayItems.slice(0, DAY_PREVIEW_LIMIT).map(item => (
                            <CalendarEventRow
                              key={item.id}
                              item={item}
                              onOpen={() => setOpenDay(day)}
                            />
                          ))}

                          {dayItems.length > DAY_PREVIEW_LIMIT && (
                            <button
                              type="button"
                              onClick={() => setOpenDay(day)}
                              className="w-full rounded-md px-1 py-0.5 text-left text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              {`+${dayItems.length - DAY_PREVIEW_LIMIT} more`}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Day view — the full list for one day, at card size. Week-mode cells
          stay scannable; this is where a crowded day is actually worked. */}
      <DayDetailDialog
        day={openDay}
        items={openDay ? getItems(openDay) : []}
        campaignPlatforms={campaignPlatforms}
        canReRoll={canReRoll}
        onClose={() => setOpenDay(null)}
        onEdit={(id) => {
          setOpenDay(null);
          onEdit(id);
        }}
        onReRoll={onReRoll}
        onDelete={onDelete}
        onApprove={onApprove}
        onScheduleChange={onScheduleChange}
      />
    </div>
  );
}

// ── Agenda view ───────────────────────────────────────────────────────────────
// A chronological list grouped by day. This is the right lead view for a Blitz:
// its whole run lands on one or two days, so a week grid spends six columns
// saying "nothing here" and crams everything into the seventh. Days with no
// posts are skipped entirely rather than rendered as empty cells.
function AgendaView({
  days,
  getItems,
  campaignPlatforms,
  canReRoll,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onScheduleChange,
}: {
  days: Date[];
  getItems: (day: Date) => ReviewItem[];
  campaignPlatforms: string[];
  canReRoll: boolean;
  onEdit: (id: string) => void;
  onReRoll: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onScheduleChange: (itemId: string, date: string, time: string) => void;
}) {
  const populated = days
    .map(day => ({ day, items: getItems(day) }))
    .filter(({ items }) => items.length > 0);

  if (populated.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-10 text-center">
        <p className="text-body text-muted-foreground">No posts scheduled yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {populated.map(({ day, items }) => {
        const approved = items.filter(i => i.status === 'approved').length;
        return (
          <div key={day.toISOString()} className="space-y-2">
            {/* Day header */}
            <div className="flex items-baseline gap-2 border-b pb-1.5">
              <h4 className={`text-sm font-semibold ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
                {format(day, 'EEEE, MMMM d')}
              </h4>
              <span className="text-meta text-muted-foreground">
                {items.length}
                {items.length === 1 ? ' post' : ' posts'}
                {' · '}
                {approved}
                {' approved'}
              </span>
            </div>

            <div className="space-y-2">
              {items.map(item => (
                <AgendaRow
                  key={item.id}
                  item={item}
                  campaignPlatforms={campaignPlatforms}
                  canReRoll={canReRoll}
                  onEdit={() => onEdit(item.id)}
                  onReRoll={() => onReRoll(item.id)}
                  onDelete={() => onDelete(item.id)}
                  onApprove={() => onApprove(item.id)}
                  onScheduleChange={(d, t) => onScheduleChange(item.id, d, t)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Agenda row (one post in the agenda list) ──────────────────────────────────
// Wide enough for a real preview plus the full action set, so a Blitz can be
// reviewed top-to-bottom without opening anything.
function AgendaRow({
  item,
  campaignPlatforms,
  canReRoll,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onScheduleChange,
}: {
  item: ReviewItem;
  campaignPlatforms: string[];
  canReRoll: boolean;
  onEdit: () => void;
  onReRoll: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onScheduleChange: (date: string, time: string) => void;
}) {
  const thumb = getThumb(item);
  const videoUrl = getVideoUrl(item);
  const isVideoType = VIDEO_CONTENT_TYPES.has(item.contentType ?? '');
  const approved = item.status === 'approved';
  const primaryPlatform = campaignPlatforms[0] ?? (Array.isArray(item.targetPlatforms) ? String(item.targetPlatforms[0] ?? '') : '');
  const overlayText = getOverlayText(item);
  const [cardRef, inView] = useInView<HTMLDivElement>({ rootMargin: '200px', once: false });

  return (
    <div
      ref={cardRef}
      className={`flex gap-3 rounded-xl border bg-card p-2.5 transition-shadow hover:shadow-sm ${
        approved ? 'ring-1 ring-emerald-400/60' : ''
      }`}
    >
      {/* Preview */}
      <button
        type="button"
        onClick={onEdit}
        className="relative aspect-[9/16] w-14 shrink-0 overflow-hidden rounded-lg bg-muted"
      >
        {isVideoType && videoUrl && inView
          ? (
              <video
                src={videoUrl}
                poster={thumb ?? undefined}
                className="size-full object-cover"
                autoPlay
                muted
                loop
                playsInline
                preload="none"
              />
            )
          : thumb
            ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
              )
            : null}
        {overlayText && (thumb || videoUrl) && <HighlightCaption item={item} />}
      </button>

      {/* Detail */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onEdit} className="group min-w-0 flex-1 text-left">
            <p className="line-clamp-2 text-xs leading-relaxed text-foreground group-hover:text-primary">
              {item.caption ?? ''}
            </p>
          </button>

          {approved && (
            <Badge className="shrink-0 bg-emerald-500 px-1.5 py-0 text-[9px] text-white">Approved</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
          {item.scheduledTime && <span className="font-medium text-foreground">{item.scheduledTime}</span>}
          <span>{ctLabel(item.contentType)}</span>
          {item.angleName && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
              style={{ backgroundColor: item.angleColor ?? '#f97316' }}
            >
              {item.angleName}
            </span>
          )}
          {primaryPlatform && (
            <span className="origin-left scale-75">
              <PlatformIcon platform={primaryPlatform} />
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center gap-1">
          <SchedulePicker
            date={item.scheduledDate}
            time={item.scheduledTime}
            onChange={onScheduleChange}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onEdit}>
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onReRoll} disabled={!canReRoll}>
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Re-roll</TooltipContent>
          </Tooltip>

          {!approved && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0 text-muted-foreground hover:text-emerald-600"
                  onClick={onApprove}
                >
                  <Check className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Approve</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto size-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

// ── Day view ──────────────────────────────────────────────────────────────────
// Opened from a day cell. Reuses the grid-view PostCard so a post looks and
// behaves the same everywhere in review — same preview, same actions.
function DayDetailDialog({
  day,
  items,
  campaignPlatforms,
  canReRoll,
  onClose,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onScheduleChange,
}: {
  day: Date | null;
  items: ReviewItem[];
  campaignPlatforms: string[];
  canReRoll: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
  onReRoll: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onScheduleChange: (itemId: string, date: string, time: string) => void;
}) {
  const approved = items.filter(i => i.status === 'approved').length;

  return (
    <Dialog open={!!day} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{day ? format(day, 'EEEE, MMMM d') : ''}</DialogTitle>
          <DialogDescription>
            {items.length}
            {items.length === 1 ? ' post' : ' posts'}
            {' scheduled · '}
            {approved}
            {' approved'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="grid grid-cols-2 gap-3 pr-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map(item => (
              <PostCard
                key={item.id}
                item={item}
                campaignPlatforms={campaignPlatforms}
                canReRoll={canReRoll}
                onEdit={() => onEdit(item.id)}
                onReRoll={() => onReRoll(item.id)}
                onDelete={() => onDelete(item.id)}
                onApprove={() => onApprove(item.id)}
                onScheduleChange={(d, t) => onScheduleChange(item.id, d, t)}
              />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Calendar event row (one post inside a day cell) ───────────────────────────
// Deliberately compact: at a ~120px column a full 9:16 card is unreadable and
// pushes the week off-screen. Thumbnail + time + caption is the pattern every
// calendar UI converges on; the media lives in the day view.
function CalendarEventRow({ item, onOpen }: { item: ReviewItem; onOpen: () => void }) {
  const thumb = getThumb(item);
  const accent = item.angleColor ?? '#f97316';
  const approved = item.status === 'approved';

  return (
    <button
      type="button"
      onClick={onOpen}
      // The angle colour rides on the row's left border rather than a separate
      // pill — at a ~120px column every pixel belongs to the caption.
      className="flex w-full items-center gap-1.5 overflow-hidden rounded-md border border-l-2 border-transparent bg-background/70 p-1 pl-1.5 text-left transition-colors hover:border-border hover:bg-muted"
      style={{ borderLeftColor: accent }}
    >
      <span className="relative h-8 w-[18px] shrink-0 overflow-hidden rounded-[3px] bg-muted">
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-medium leading-tight text-foreground">
          {item.caption || ctLabel(item.contentType)}
        </span>
        <span className="block truncate text-[9px] leading-tight text-muted-foreground">
          {item.scheduledTime ?? ''}
          {item.scheduledTime ? ' · ' : ''}
          {ctLabel(item.contentType)}
        </span>
      </span>

      {approved && <Check className="size-3 shrink-0 text-emerald-500" />}
    </button>
  );
}

'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { format, isSameDay, isToday, parseISO, addDays } from 'date-fns';
import {
  CalendarDays,
  Check,
  Info,
  LayoutGrid,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { Campaign, ContentItem } from '@/types/v2';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
import { CampaignPostEditModal } from './CampaignPostEditModal';

// ── Platform icon ─────────────────────────────────────────────────────────────
function PlatformIcon({ platform }: { platform: string }) {
  const p = platform.toLowerCase();
  if (p === 'youtube')
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-4 fill-red-600">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      </span>
    );
  if (p === 'instagram')
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 shadow-sm">
        <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
        </svg>
      </span>
    );
  if (p === 'tiktok')
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-black shadow-sm">
        <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.79a4.85 4.85 0 0 1-1-.1z" />
        </svg>
      </span>
    );
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-blue-600 shadow-sm">
      <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    </span>
  );
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

interface CampaignReviewGridProps {
  campaign: Campaign;
  contentItems: ReviewItem[];
  onEdit: (itemId: string) => void;
  onReRoll: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onApprove: (itemId: string) => void;
  onSkip?: (itemId: string) => void;
  onScheduleChange: (itemId: string, date: string, time: string) => void;
  onItemUpdated?: (updated: ContentItem) => void;
}

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
  const reRolls = campaign.reRollsRemaining ?? 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Review your campaign</h3>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${reRolls <= 3 ? 'text-destructive' : 'text-foreground'}`}>
              {reRolls} re-rolls left
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {contentItems.map((item) => (
              <PostCard
                key={item.id}
                item={item}
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
            onEdit={(id) => {
              const it = contentItems.find((i) => i.id === id);
              if (it) setEditingItem(it);
            }}
            onReRoll={(id) => reRolls > 0 && onReRoll(id)}
            onDelete={onDelete}
            onScheduleChange={onScheduleChange}
          />
        )}

        {/* ── Bulk approve ── */}
        <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {contentItems.filter((i) => i.status === 'approved').length} / {contentItems.length} approved
          </span>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => contentItems.forEach((i) => onApprove(i.id))}
          >
            <Check className="mr-1.5 size-3.5" />
            Approve all
          </Button>
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
  const selected = date ? parseISO(date) : undefined;

  const label = date
    ? `${format(parseISO(date), 'MMM d')}${time ? `, ${time}` : ''}`
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
            if (day) onChange(format(day, 'yyyy-MM-dd'), time ?? '09:00');
          }}
          autoFocus
        />
        <Separator />
        <div className="flex items-center gap-2 p-3">
          <label className="text-xs text-muted-foreground">Time</label>
          <input
            type="time"
            defaultValue={time ?? '09:00'}
            onChange={(e) => onChange(date ?? format(new Date(), 'yyyy-MM-dd'), e.target.value)}
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
function InfoPopover({ item }: { item: ReviewItem }) {
  const enrichment = (item.enrichmentData ?? {}) as Record<string, unknown>;
  const contentType = String((enrichment.contentType as string) ?? item.contentType ?? '—');
  const angle = item.angleName ?? String((enrichment.angleName as string) ?? '—');
  const platform = Array.isArray(item.targetPlatforms)
    ? String(item.targetPlatforms[0] ?? '—')
    : '—';
  const scheduledLabel = item.scheduledDate
    ? `${format(parseISO(item.scheduledDate), 'EEE, MMM d')}${item.scheduledTime ? `, ${item.scheduledTime}` : ''}`
    : 'Unscheduled';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-full border border-white/30 bg-white/80 backdrop-blur-sm hover:bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="size-3.5 text-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 text-xs" align="end" side="bottom">
        <div className="space-y-1.5">
          <InfoRow label="Content type" value={contentType} />
          <InfoRow label="Angle" value={angle} />
          <InfoRow label="Platform" value={platform} />
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
      <span className="truncate text-right font-medium capitalize">{value}</span>
    </div>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────
function PostCard({
  item,
  canReRoll,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onSkip,
  onScheduleChange,
}: {
  item: ReviewItem;
  canReRoll: boolean;
  onEdit: () => void;
  onReRoll: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onSkip?: () => void;
  onScheduleChange: (date: string, time: string) => void;
}) {
  const thumb = item.graphicUrls?.[0];
  const approved = item.status === 'approved';
  const platform = Array.isArray(item.targetPlatforms) ? String(item.targetPlatforms[0] ?? '') : '';
  const angleColor = item.angleColor ?? '#f97316';

  return (
    <div className={`overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md ${approved ? 'ring-1 ring-emerald-400' : ''}`}>
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] cursor-pointer overflow-hidden bg-muted" onClick={onEdit}>
        {thumb ? (
          <Image
            src={thumb}
            alt={item.caption?.slice(0, 40) ?? 'Post'}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, 20vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/25">
            <svg className="size-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Platform badge */}
        {platform && <div className="absolute left-2 top-2 z-10"><PlatformIcon platform={platform} /></div>}

        {/* Info popover */}
        <div className="absolute right-2 top-2 z-10">
          <InfoPopover item={item} />
        </div>

        {/* Approved chip */}
        {approved && (
          <div className="absolute left-2 top-10 z-10">
            <Badge className="bg-emerald-500 text-white text-[9px] px-1.5 py-0">Approved</Badge>
          </div>
        )}

        {/* Angle pill */}
        {item.angleName && (
          <div
            className="absolute bottom-2 left-2 z-10 rounded-full px-2 py-0.5 text-[9px] font-semibold text-white"
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
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}>
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onReRoll} disabled={!canReRoll}>
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Re-roll</TooltipContent>
          </Tooltip>

          {!approved && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-emerald-600" onClick={onApprove}>
                  <Check className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Approve</TooltipContent>
            </Tooltip>
          )}

          {onSkip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onSkip}>
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
                  </svg>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Skip</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
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
  onEdit,
  onReRoll,
  onDelete,
  onScheduleChange,
}: {
  contentItems: ReviewItem[];
  campaign: Campaign;
  onEdit: (id: string) => void;
  onReRoll: (id: string) => void;
  onDelete: (id: string) => void;
  onScheduleChange: (itemId: string, date: string, time: string) => void;
}) {
  const start = campaign.startDate ? parseISO(campaign.startDate) : new Date();
  const totalDays = campaign.campaignLengthDays ?? 7;

  const days = Array.from({ length: totalDays }, (_, i) => addDays(start, i));

  // Split into weeks
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const getItems = (day: Date) =>
    contentItems.filter(
      (it) => it.scheduledDate && isSameDay(parseISO(it.scheduledDate), day),
    );

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-muted-foreground">
        {format(start, 'MMM d')} – {format(addDays(start, totalDays - 1), 'MMM d, yyyy')}
      </p>

      <ScrollArea className="w-full">
        <div className="space-y-3 pb-2 min-w-[560px]">
          {weeks.map((week, wi) => (
            <div key={wi}>
              {/* Day name headers — only first week */}
              {wi === 0 && (
                <div
                  className="grid gap-2 mb-1"
                  style={{ gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))` }}
                >
                  {week.map((day, di) => (
                    <div key={di} className="text-center text-[11px] font-semibold text-muted-foreground">
                      {format(day, 'EEE')}
                    </div>
                  ))}
                </div>
              )}

              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))` }}
              >
                {week.map((day, di) => {
                  const dayItems = getItems(day);
                  const today = isToday(day);
                  return (
                    <div
                      key={di}
                      className={`min-h-[120px] rounded-xl border p-2 ${
                        today
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-border bg-muted/20'
                      }`}
                    >
                      {/* Date number */}
                      <div className="mb-2 flex justify-center">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                            today
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {format(day, 'd')}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {dayItems.map((item) => (
                          <CalendarCard
                            key={item.id}
                            item={item}
                            onEdit={() => onEdit(item.id)}
                            onReRoll={() => onReRoll(item.id)}
                            onDelete={() => onDelete(item.id)}
                            onScheduleChange={(d, t) => onScheduleChange(item.id, d, t)}
                          />
                        ))}
                        {dayItems.length === 0 && (
                          <div className="flex items-center justify-center py-3">
                            <span className="text-[10px] text-muted-foreground/30">–</span>
                          </div>
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
    </div>
  );
}

// ── Calendar card (post inside a calendar day) ────────────────────────────────
function CalendarCard({
  item,
  onEdit,
  onReRoll,
  onDelete,
  onScheduleChange,
}: {
  item: ReviewItem;
  onEdit: () => void;
  onReRoll: () => void;
  onDelete: () => void;
  onScheduleChange: (date: string, time: string) => void;
}) {
  const thumb = item.graphicUrls?.[0];
  const platform = Array.isArray(item.targetPlatforms) ? String(item.targetPlatforms[0] ?? '') : '';
  const angleColor = item.angleColor ?? '#f97316';

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Thumbnail */}
      {thumb && (
        <div
          className="relative aspect-[9/16] cursor-pointer overflow-hidden"
          onClick={onEdit}
        >
          <Image src={thumb} alt="" fill className="object-cover" sizes="120px" />
          {platform && (
            <div className="absolute left-1 top-1 scale-75 origin-top-left">
              <PlatformIcon platform={platform} />
            </div>
          )}
          {item.angleName && (
            <div
              className="absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold text-white"
              style={{ backgroundColor: angleColor }}
            >
              {item.angleName}
            </div>
          )}
        </div>
      )}

      <div className="p-1.5 space-y-1">
        <p
          className="line-clamp-2 cursor-pointer text-[10px] leading-snug text-foreground hover:text-primary"
          onClick={onEdit}
        >
          {item.caption ?? ''}
        </p>

        {/* Time */}
        <SchedulePicker
          date={item.scheduledDate}
          time={item.scheduledTime}
          onChange={onScheduleChange}
        />

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit}>
            <Pencil className="size-2.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onReRoll}>
            <RefreshCw className="size-2.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-2.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

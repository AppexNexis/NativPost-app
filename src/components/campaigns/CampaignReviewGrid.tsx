'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Calendar, Check, Clock, Copy, Info, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { ContentItem, Campaign } from '@/types/v2';
import { CampaignPostEditModal } from './CampaignPostEditModal';
import { InlineEditorOverlay } from '@/components/editor/InlineEditorOverlay';

// ── Platform icons ────────────────────────────────────────────────────────────
function PlatformIcon({ platform }: { platform: string }) {
  const p = platform.toLowerCase();
  if (p === 'youtube') {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-4 fill-red-600"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
      </div>
    );
  }
  if (p === 'instagram') {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 shadow-sm">
        <svg viewBox="0 0 24 24" className="size-3.5 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" /></svg>
      </div>
    );
  }
  if (p === 'tiktok') {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-black shadow-sm">
        <svg viewBox="0 0 24 24" className="size-3.5 fill-white"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.79a4.85 4.85 0 0 1-1-.1z" /></svg>
      </div>
    );
  }
  if (p === 'facebook') {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-blue-600 shadow-sm">
        <svg viewBox="0 0 24 24" className="size-3.5 fill-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
      </div>
    );
  }
  return (
    <div className="flex size-6 items-center justify-center rounded-full bg-black shadow-sm">
      <svg viewBox="0 0 24 24" className="size-3.5 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.213 5.567zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ReviewItem = ContentItem & {
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

// ── Main component ────────────────────────────────────────────────────────────
export function CampaignReviewGrid({
  campaign,
  contentItems,
  onEdit: _onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onSkip,
  onScheduleChange,
  onItemUpdated,
}: CampaignReviewGridProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');
  const [editingItem, setEditingItem] = useState<ReviewItem | null>(null);
  const [swapVideoItem, setSwapVideoItem] = useState<ReviewItem | null>(null);

  const handleReRoll = (itemId: string) => {
    if (campaign.reRollsRemaining > 0) onReRoll(itemId);
  };

  const reRollsRemaining = campaign.reRollsRemaining ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Review your campaign</h3>
        <div className="flex items-center gap-4">
          <span className={`text-sm font-medium ${reRollsRemaining <= 3 ? 'text-destructive' : 'text-foreground'}`}>
            {reRollsRemaining} re-rolls left
          </span>
          <div className="flex overflow-hidden rounded-lg border bg-background">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'calendar' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Calendar
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {contentItems.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              canReRoll={reRollsRemaining > 0}
              onEdit={() => setEditingItem(item)}
              onReRoll={() => handleReRoll(item.id)}
              onDelete={() => onDelete(item.id)}
              onApprove={() => onApprove(item.id)}
              onSkip={onSkip ? () => onSkip(item.id) : undefined}
              onScheduleChange={(date, time) => onScheduleChange(item.id, date, time)}
            />
          ))}
        </div>
      ) : (
        <CalendarView
          contentItems={contentItems}
          campaign={campaign}
          onEdit={(id) => {
            const item = contentItems.find(i => i.id === id);
            if (item) setEditingItem(item);
          }}
          onReRoll={onReRoll}
          onDelete={onDelete}
          onApprove={onApprove}
        />
      )}

      {/* Bulk actions */}
      <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {contentItems.filter((i) => i.status === 'approved').length} of {contentItems.length} approved
        </span>
        <button
          type="button"
          onClick={() => contentItems.forEach((i) => onApprove(i.id))}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <Check className="size-4" />
          Approve all
        </button>
      </div>

      {/* Lightweight campaign post edit modal */}
      {editingItem && !swapVideoItem && (
        <CampaignPostEditModal
          campaignId={campaign.id}
          contentItem={editingItem}
          reRollsRemaining={reRollsRemaining}
          onCancel={() => setEditingItem(null)}
          onSaved={(updated) => {
            onItemUpdated?.(updated);
            setEditingItem(null);
          }}
          onSwapVideo={() => {
            setSwapVideoItem(editingItem);
            setEditingItem(null);
          }}
        />
      )}

      {/* Full editor for swap video / audio */}
      {swapVideoItem && (
        <InlineEditorOverlay
          contentItemId={swapVideoItem.id}
          onCancel={() => setSwapVideoItem(null)}
          onDone={(updatedItem) => {
            if (updatedItem) onItemUpdated?.(updatedItem);
            setSwapVideoItem(null);
          }}
        />
      )}
    </div>
  );
}

// ── Review Card ───────────────────────────────────────────────────────────────
function ReviewCard({
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
  const [showSchedule, setShowSchedule] = useState(false);
  const thumbnail = item.graphicUrls?.[0];
  const isApproved = item.status === 'approved';
  const firstPlatform = Array.isArray(item.targetPlatforms) ? String(item.targetPlatforms[0] ?? '') : '';
  const angleName = item.angleName ?? null;
  const angleColor = item.angleColor ?? '#f97316';

  return (
    <div className={`overflow-hidden rounded-xl border bg-card transition-all ${isApproved ? 'ring-1 ring-emerald-300' : ''}`}>
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] overflow-hidden bg-muted">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={item.caption?.slice(0, 50) ?? 'Content'}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, 20vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/30">
            <svg className="size-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Platform icon top-left */}
        {firstPlatform && (
          <div className="absolute left-2 top-2 z-10">
            <PlatformIcon platform={firstPlatform} />
          </div>
        )}

        {/* Info icon top-right */}
        <button
          type="button"
          title="View details"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full border border-white/30 bg-white/80 backdrop-blur-sm hover:bg-white"
        >
          <Info className="size-3.5 text-foreground" />
        </button>

        {/* Approved badge */}
        {isApproved && (
          <div className="absolute left-2 top-10 z-10">
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              Approved
            </span>
          </div>
        )}

        {/* Anti-slop score */}
        {item.antiSlopScore !== null && item.antiSlopScore !== undefined && (
          <div className="absolute bottom-10 right-2 z-10">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${
              item.antiSlopScore >= 0.8 ? 'bg-emerald-500' : item.antiSlopScore >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
            }`}>
              {(item.antiSlopScore * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {/* Angle pill bottom-left */}
        {angleName && (
          <div
            className="absolute bottom-2 left-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: angleColor }}
          >
            {angleName}
          </div>
        )}
      </div>

      {/* Below-card info — always visible */}
      <div className="p-2.5 space-y-1.5">
        {/* Caption with edit hint */}
        <button
          type="button"
          onClick={onEdit}
          className="group flex w-full items-start gap-1 text-left"
        >
          <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-foreground group-hover:text-primary">
            {item.caption ?? ''}
          </p>
          <Pencil className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </button>

        {/* Scheduled date */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="size-3" />
            {item.scheduledDate ? (
              <span>{new Date(item.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            ) : (
              <span className="text-muted-foreground/50">Unscheduled</span>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowSchedule(!showSchedule); }}
            className="flex items-center gap-1 text-primary hover:text-primary/80"
          >
            <Clock className="size-3" />
            {item.scheduledTime ?? 'Set time'}
          </button>
        </div>

        {showSchedule && (
          <div className="flex gap-2">
            <input
              type="date"
              defaultValue={item.scheduledDate ?? ''}
              onChange={(e) => onScheduleChange(e.target.value, item.scheduledTime ?? '09:00')}
              className="flex-1 rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <input
              type="time"
              defaultValue={item.scheduledTime ?? '09:00'}
              onChange={(e) => onScheduleChange(item.scheduledDate ?? '', e.target.value)}
              className="w-20 rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-0.5 pt-0.5">
          <button type="button" onClick={onEdit} title="Edit" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Pencil className="size-3.5" />
          </button>
          <button type="button" onClick={onReRoll} title="Re-roll" disabled={!canReRoll} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
            <RefreshCw className="size-3.5" />
          </button>
          <button type="button" title="Copy" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Copy className="size-3.5" />
          </button>
          {!isApproved && (
            <button type="button" onClick={onApprove} title="Approve" className="rounded-md p-1 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600">
              <Check className="size-3.5" />
            </button>
          )}
          {onSkip && (
            <button type="button" onClick={onSkip} title="Skip" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
            </button>
          )}
          <button type="button" onClick={onDelete} title="Delete" className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────────────────────
function CalendarView({
  contentItems,
  campaign,
  onEdit,
  onReRoll,
  onDelete,
}: {
  contentItems: ReviewItem[];
  campaign: Campaign;
  onEdit: (id: string) => void;
  onReRoll: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  const startDate = campaign.startDate ? new Date(campaign.startDate) : new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + (campaign.campaignLengthDays ?? 7) - 1);

  const startLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const days = Array.from({ length: campaign.campaignLengthDays ?? 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      <p className="text-center text-sm font-medium text-foreground">
        {startLabel} – {endLabel}
      </p>
      <div className="grid grid-cols-7 gap-2">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const dayItems = contentItems.filter(
            (item) => item.scheduledDate && new Date(item.scheduledDate).toDateString() === day.toDateString(),
          );
          return (
            <div key={i} className="min-h-[120px] rounded-xl border bg-muted/30 p-2">
              <div className="mb-1 text-center text-xs font-medium text-muted-foreground">{day.getDate()}</div>
              {dayItems.map((item) => (
                <div key={item.id} className="mb-1.5 overflow-hidden rounded-lg border bg-card shadow-sm">
                  {item.graphicUrls?.[0] && (
                    <div className="relative aspect-[9/16] w-full">
                      <Image src={item.graphicUrls[0]} alt="" fill className="object-cover" sizes="80px" />
                    </div>
                  )}
                  <div className="p-1.5">
                    <p className="line-clamp-1 text-[10px] text-foreground">{item.caption}</p>
                    {item.scheduledTime && (
                      <p className="text-[10px] text-muted-foreground">{item.scheduledTime}</p>
                    )}
                    <div className="mt-1 flex gap-1">
                      <button type="button" onClick={() => onEdit(item.id)} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="size-3" />
                      </button>
                      <button type="button" onClick={() => onReRoll(item.id)} className="text-muted-foreground hover:text-foreground">
                        <RefreshCw className="size-3" />
                      </button>
                      <button type="button" onClick={() => onDelete(item.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

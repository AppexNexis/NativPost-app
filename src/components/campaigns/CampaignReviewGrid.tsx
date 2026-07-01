import React, { useState } from 'react';
import Image from 'next/image';
import { RefreshCw, Pencil, SkipForward, Trash2, Clock, Calendar, Check, AlertTriangle } from 'lucide-react';
import type { ContentItem, Campaign } from '@/types/v2';

interface CampaignReviewGridProps {
  campaign: Campaign;
  contentItems: (ContentItem & { sequenceIndex?: number; scheduledDate?: string; scheduledTime?: string; isRolled?: boolean })[];
  onEdit: (itemId: string) => void;
  onReRoll: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onApprove: (itemId: string) => void;
  onSkip?: (itemId: string) => void;
  onScheduleChange: (itemId: string, date: string, time: string) => void;
}

export function CampaignReviewGrid({
  campaign,
  contentItems,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onSkip,
  onScheduleChange,
}: CampaignReviewGridProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');

  const handleReRoll = (itemId: string) => {
    if (campaign.reRollsRemaining > 0) onReRoll(itemId);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Review your campaign</h3>
          <p className="text-sm text-muted-foreground">
            {contentItems.length} of {campaign.totalPosts} posts ready
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-primary">{campaign.reRollsRemaining}</span> re-rolls left
          </span>
          <div className="flex rounded-lg border bg-background">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-l-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`rounded-r-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'calendar' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Re-roll warning */}
      {campaign.reRollsRemaining === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          You've used all your re-rolls. You can still edit posts individually or delete and regenerate the campaign.
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {contentItems.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              isSelected={selectedItemId === item.id}
              canReRoll={campaign.reRollsRemaining > 0}
              onSelect={() => setSelectedItemId(item.id)}
              onEdit={() => onEdit(item.id)}
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
          onEdit={onEdit}
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
          onClick={() => contentItems.forEach((i) => onApprove(i.id))}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <Check className="h-4 w-4" />
          Approve all
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Review Card
// ============================================================
function ReviewCard({
  item,
  isSelected,
  canReRoll,
  onSelect,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onSkip,
  onScheduleChange,
}: {
  item: ContentItem & { sequenceIndex?: number; scheduledDate?: string; scheduledTime?: string; isRolled?: boolean };
  isSelected: boolean;
  canReRoll: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onReRoll: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onSkip?: () => void;
  onScheduleChange: (date: string, time: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const thumbnail = item.graphicUrls?.[0];
  const isApproved = item.status === 'approved';
  const isReRolled = item.isRolled;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-card transition-all ${
        isSelected ? 'border-primary ring-2 ring-primary' : ''
      } ${isApproved ? 'ring-1 ring-emerald-300' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] overflow-hidden bg-muted">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={item.caption?.slice(0, 50) || 'Content'}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, 20vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/30">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Status badges */}
        <div className="absolute left-2 top-2 flex gap-1">
          {isApproved && (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
              Approved
            </span>
          )}
          {isReRolled && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
              Re-rolled
            </span>
          )}
          {item.antiSlopScore !== null && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white ${
              item.antiSlopScore >= 0.8 ? 'bg-emerald-500' : item.antiSlopScore >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
            }`}>
              {(item.antiSlopScore * 100).toFixed(0)}%
            </span>
          )}
        </div>

        {/* Hover overlay */}
        <div
          className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-b from-transparent via-black/20 to-black/70 p-2 transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex gap-1">
            <ActionButton onClick={onEdit} icon={<Pencil className="h-3 w-3" />} label="Edit" />
            <ActionButton onClick={onReRoll} icon={<RefreshCw className="h-3 w-3" />} label="Re-roll" disabled={!canReRoll} />
            {onSkip && (
              <ActionButton onClick={onSkip} icon={<SkipForward className="h-3 w-3" />} label="Skip" />
            )}
            <ActionButton onClick={onDelete} icon={<Trash2 className="h-3 w-3" />} label="Delete" />
            {!isApproved && (
              <ActionButton onClick={onApprove} icon={<Check className="h-3 w-3" />} label="Approve" variant="green" />
            )}
          </div>
        </div>

        {item.durationSeconds && (
          <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {Math.round(item.durationSeconds)}s
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="line-clamp-2 text-xs leading-relaxed text-foreground">{item.caption}</p>
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {item.scheduledDate ? (
              <span>{new Date(item.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            ) : (
              <span className="text-muted-foreground/50">Unscheduled</span>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowSchedule(!showSchedule); }}
            className="flex items-center gap-1 text-primary hover:text-primary/80"
          >
            <Clock className="h-3 w-3" />
            {item.scheduledTime || 'Set time'}
          </button>
        </div>

        {showSchedule && (
          <div className="mt-2 flex gap-2">
            <input
              type="date"
              defaultValue={item.scheduledDate || ''}
              onChange={(e) => onScheduleChange(e.target.value, item.scheduledTime || '09:00')}
              className="flex-1 rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <input
              type="time"
              defaultValue={item.scheduledTime || '09:00'}
              onChange={(e) => onScheduleChange(item.scheduledDate || '', e.target.value)}
              className="w-20 rounded border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-1">
          {item.contentFormat && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
              {item.contentFormat.replace('_', ' ')}
            </span>
          )}
          {item.aspectRatio && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {item.aspectRatio}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
  variant = 'default',
  disabled = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  variant?: 'default' | 'green';
  disabled?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
      disabled={disabled}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${
        variant === 'green'
          ? 'bg-emerald-500/90 text-white hover:bg-emerald-600'
          : 'bg-white/90 text-foreground hover:bg-white dark:bg-foreground/10 dark:text-foreground dark:hover:bg-foreground/20'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================================
// Calendar View
// ============================================================
function CalendarView({
  contentItems,
  campaign,
  onEdit,
  onReRoll,
  onDelete,
}: {
  contentItems: (ContentItem & { sequenceIndex?: number; scheduledDate?: string })[];
  campaign: Campaign;
  onEdit: (id: string) => void;
  onReRoll: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
}) {
  const startDate = campaign.startDate ? new Date(campaign.startDate) : new Date();
  const days = Array.from({ length: campaign.campaignLengthDays || 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => (
          <div key={i} className="text-center">
            <div className="text-xs font-medium text-muted-foreground">{dayNames[day.getDay()]}</div>
            <div className="text-lg font-semibold text-foreground">{day.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const dayItems = contentItems.filter(
            (item) => item.scheduledDate && new Date(item.scheduledDate).toDateString() === day.toDateString()
          );
          return (
            <div key={i} className="min-h-[120px] rounded-xl border bg-muted/30 p-2">
              {dayItems.map((item) => (
                <div
                  key={item.id}
                  className="mb-1.5 cursor-pointer overflow-hidden rounded-lg bg-card shadow-sm"
                  onClick={() => onEdit(item.id)}
                >
                  {item.graphicUrls?.[0] && (
                    <div className="relative aspect-[9/16] w-full">
                      <Image src={item.graphicUrls[0]} alt="" fill className="object-cover" sizes="80px" />
                    </div>
                  )}
                  <div className="p-1.5">
                    <p className="line-clamp-1 text-[10px] text-foreground">{item.caption}</p>
                    <div className="mt-1 flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); onReRoll(item.id); }} className="text-muted-foreground hover:text-foreground">
                        <RefreshCw className="h-3 w-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
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

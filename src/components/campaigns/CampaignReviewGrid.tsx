import React, { useState } from 'react';
import Image from 'next/image';
import { RefreshCw, Pencil, Trash2, Clock, Calendar, Check, AlertTriangle } from 'lucide-react';
import type { ContentItem, Campaign, CampaignContentItem } from '@/types/v2';

interface CampaignReviewGridProps {
  campaign: Campaign;
  contentItems: (ContentItem & { sequenceIndex?: number; scheduledDate?: string; scheduledTime?: string; isRolled?: boolean })[];
  onEdit: (itemId: string) => void;
  onReRoll: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onApprove: (itemId: string) => void;
  onScheduleChange: (itemId: string, date: string, time: string) => void;
}

export function CampaignReviewGrid({
  campaign,
  contentItems,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
  onScheduleChange,
}: CampaignReviewGridProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');
  const [editScheduleItem, setEditScheduleItem] = useState<string | null>(null);

  const handleReRoll = (itemId: string) => {
    if (campaign.reRollsRemaining > 0) {
      onReRoll(itemId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Review your campaign</h3>
          <p className="text-sm text-gray-500">
            {contentItems.length} of {campaign.totalPosts} posts ready
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            <span className="font-semibold text-orange-600">{campaign.reRollsRemaining}</span> re-rolls left
          </span>
          <div className="flex rounded-lg border border-gray-200 bg-white">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 text-sm font-medium ${viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-sm font-medium ${viewMode === 'calendar' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Re-roll warning */}
      {campaign.reRollsRemaining === 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
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
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <span className="text-sm text-gray-600">
          {contentItems.filter((i) => i.status === 'approved').length} of {contentItems.length} approved
        </span>
        <button
          onClick={() => contentItems.forEach((i) => onApprove(i.id))}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
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
  onScheduleChange: (date: string, time: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const thumbnail = item.graphicUrls?.[0];
  const isApproved = item.status === 'approved';
  const isReRolled = item.isRolled;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-white transition-all ${
        isSelected ? 'border-orange-500 ring-2 ring-orange-500' : 'border-gray-200'
      } ${isApproved ? 'ring-1 ring-green-200' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      {/* Thumbnail / Video Preview */}
      <div className="relative aspect-[9/16] overflow-hidden bg-gray-100">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={item.caption?.slice(0, 50) || 'Content'}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, 20vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Status badges */}
        <div className="absolute top-2 left-2 flex gap-1">
          {isApproved && (
            <span className="rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
              Approved
            </span>
          )}
          {isReRolled && (
            <span className="rounded-full bg-purple-500 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
              Re-rolled
            </span>
          )}
          {item.antiSlopScore !== null && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white uppercase ${
              item.antiSlopScore >= 0.8 ? 'bg-green-500' : item.antiSlopScore >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
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
            <ActionButton onClick={onDelete} icon={<Trash2 className="h-3 w-3" />} label="Delete" />
            {!isApproved && (
              <ActionButton onClick={onApprove} icon={<Check className="h-3 w-3" />} label="Approve" variant="green" />
            )}
          </div>
        </div>

        {/* Duration badge */}
        {item.durationSeconds && (
          <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {Math.round(item.durationSeconds)}s
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="line-clamp-2 text-xs text-gray-700 leading-relaxed">{item.caption}</p>
        <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {item.scheduledDate ? (
              <span>{new Date(item.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            ) : (
              <span className="text-gray-300">Unscheduled</span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSchedule(!showSchedule);
            }}
            className="flex items-center gap-1 text-orange-600 hover:text-orange-700"
          >
            <Clock className="h-3 w-3" />
            {item.scheduledTime || 'Set time'}
          </button>
        </div>

        {/* Inline schedule editor */}
        {showSchedule && (
          <div className="mt-2 flex gap-2">
            <input
              type="date"
              defaultValue={item.scheduledDate || ''}
              onChange={(e) => onScheduleChange(e.target.value, item.scheduledTime || '09:00')}
              className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs"
            />
            <input
              type="time"
              defaultValue={item.scheduledTime || '09:00'}
              onChange={(e) => onScheduleChange(item.scheduledDate || '', e.target.value)}
              className="w-20 rounded border border-gray-200 px-2 py-1 text-xs"
            />
          </div>
        )}

        {/* Content type tags */}
        <div className="mt-2 flex flex-wrap gap-1">
          {item.contentFormat && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 capitalize">
              {item.contentFormat.replace('_', ' ')}
            </span>
          )}
          {item.aspectRatio && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
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
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${
        variant === 'green'
          ? 'bg-green-500/90 text-white hover:bg-green-600'
          : 'bg-white/90 text-gray-700 hover:bg-white'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================================
// Calendar View (simplified)
// ============================================================
function CalendarView({
  contentItems,
  campaign,
  onEdit,
  onReRoll,
  onDelete,
  onApprove,
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
            <div className="text-xs font-medium text-gray-500">{dayNames[day.getDay()]}</div>
            <div className="text-lg font-semibold text-gray-900">{day.getDate()}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const dayItems = contentItems.filter(
            (item) => item.scheduledDate && new Date(item.scheduledDate).toDateString() === day.toDateString()
          );
          return (
            <div key={i} className="min-h-[120px] rounded-xl border border-gray-200 bg-gray-50 p-2">
              {dayItems.map((item) => (
                <div
                  key={item.id}
                  className="mb-1.5 cursor-pointer overflow-hidden rounded-lg bg-white shadow-sm"
                  onClick={() => onEdit(item.id)}
                >
                  {item.graphicUrls?.[0] && (
                    <div className="relative aspect-[9/16] w-full">
                      <Image
                        src={item.graphicUrls[0]}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </div>
                  )}
                  <div className="p-1.5">
                    <p className="line-clamp-1 text-[10px] text-gray-700">{item.caption}</p>
                    <div className="mt-1 flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); onReRoll(item.id); }} className="text-gray-400 hover:text-gray-600">
                        <RefreshCw className="h-3 w-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} className="text-gray-400 hover:text-red-600">
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

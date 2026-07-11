'use client';

import { CheckCircle2, MoreVertical, PencilLine, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ContentItem } from '@/types/v2';
import { cn } from '@/utils/Helpers';

import {
  ctLabel,
  getOverlayText,
  getThumb,
  getVideoUrl,
  isVideoContentType,
  PlatformIcon,
} from './preview-helpers';

// -----------------------------------------------------------
// Status pill config (bottom badge over media)
// -----------------------------------------------------------
const STATUS_PILL: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-zinc-800/80 text-zinc-100' },
  pending_review: { label: 'Pending', className: 'bg-amber-500/90 text-white' },
  approved: { label: 'Approved', className: 'bg-emerald-500/90 text-white' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-500/90 text-white' },
  published: { label: 'Published', className: 'bg-emerald-600/90 text-white' },
  rejected: { label: 'Rejected', className: 'bg-red-500/90 text-white' },
  archived: { label: 'Archived', className: 'bg-zinc-700/80 text-zinc-200' },
};

type Props = {
  item: ContentItem;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  onApprove: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  anySelected: boolean;
};

export function PostCard({
  item,
  selected,
  onToggleSelected,
  onApprove,
  onDelete,
  anySelected,
}: Props) {
  const [hover, setHover] = useState(false);

  const thumb = getThumb(item);
  const videoUrl = getVideoUrl(item);
  const overlayText = getOverlayText(item);
  const isVideo = isVideoContentType(item);
  const platforms = item.targetPlatforms ?? [];
  const primaryPlatform = platforms[0];
  const status = item.status ?? 'draft';
  const pill = STATUS_PILL[status] ?? STATUS_PILL.draft!;
  const isApproved = status === 'approved' || status === 'scheduled' || status === 'published';

  // Show checkbox on hover OR when at least one card is selected
  const showCheckbox = hover || anySelected || selected;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all',
        selected && 'ring-2 ring-primary',
        isApproved && !selected && 'ring-1 ring-emerald-400/50',
      )}
    >
      {/* Media preview — 9:16 aspect for consistency across content types */}
      <Link
        href={`/dashboard/content/${item.id}`}
        className="relative block aspect-[9/16] overflow-hidden bg-muted"
      >
        {isVideo && videoUrl
          ? (
              <video
                src={videoUrl}
                poster={thumb ?? undefined}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="size-full object-cover"
              />
            )
          : thumb
            ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="size-full object-cover" />
              )
            : (
                <div className="flex size-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 p-4 text-center text-xs text-zinc-500 dark:from-zinc-800 dark:to-zinc-900 dark:text-zinc-400">
                  <span className="line-clamp-6">{item.caption || 'No preview'}</span>
                </div>
              )}

        {/* Overlay text — centered, white with black stroke, matches on-platform look */}
        {overlayText && (thumb || videoUrl) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
            <p
              className="line-clamp-5 text-center text-sm font-bold leading-tight text-white"
              style={{ WebkitTextStroke: '1px black', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
            >
              {overlayText}
            </p>
          </div>
        )}

        {/* Top-left: checkbox (hover/selected) */}
        <div
          className={cn(
            'absolute left-2 top-2 z-10 transition-opacity',
            showCheckbox ? 'opacity-100' : 'opacity-0',
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="flex size-6 items-center justify-center rounded-md bg-white/90 shadow-sm backdrop-blur-sm">
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelected(item.id)}
              aria-label={`Select post ${item.id}`}
            />
          </div>
        </div>

        {/* Top-right: platform badge */}
        {primaryPlatform && (
          <div className="absolute right-2 top-2 z-10">
            <PlatformIcon platform={primaryPlatform} size="sm" />
          </div>
        )}

        {/* Bottom: content type + status pills */}
        <div className="absolute inset-x-2 bottom-2 z-10 flex items-center justify-between gap-2">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {ctLabel(item.contentType)}
          </span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm', pill.className)}>
            {pill.label}
          </span>
        </div>
      </Link>

      {/* Footer: caption + actions */}
      <div className="flex flex-col gap-2 border-t p-3">
        <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-foreground/80">
          {item.caption || <span className="italic text-muted-foreground">No caption</span>}
        </p>

        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/dashboard/content/${item.id}`}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted"
          >
            <PencilLine className="size-3" />
            Edit
          </Link>

          <div className="flex items-center gap-1">
            {!isApproved && (
              <button
                type="button"
                onClick={() => onApprove(item.id)}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-emerald-600"
                aria-label="Approve"
              >
                <CheckCircle2 className="size-3" />
                Approve
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-md border text-foreground/70 transition-colors hover:bg-muted"
                  aria-label="More actions"
                >
                  <MoreVertical className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/content/${item.id}`}>
                    <PencilLine className="mr-2 size-3.5" />
                    Open editor
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onSelect={() => onDelete(item.id)}
                >
                  <Trash2 className="mr-2 size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

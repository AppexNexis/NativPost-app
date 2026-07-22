'use client';

import { CheckCircle2, MoreVertical, PencilLine, Trash2 } from 'lucide-react';
import Link from 'next/link';

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
  getThumb,
  getVideoUrl,
  isVideoContentType,
  PlatformIcon,
} from './preview-helpers';

const STATUS_STYLE: Record<string, { label: string; dot: string; bg: string }> = {
  draft: { label: 'Draft', dot: 'bg-zinc-400', bg: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-400' },
  pending_review: { label: 'Pending', dot: 'bg-amber-400', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  approved: { label: 'Approved', dot: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  scheduled: { label: 'Scheduled', dot: 'bg-blue-500', bg: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  published: { label: 'Published', dot: 'bg-emerald-600', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  rejected: { label: 'Rejected', dot: 'bg-red-400', bg: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  archived: { label: 'Archived', dot: 'bg-zinc-500', bg: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-400' },
};

function formatDate(item: ContentItem): string {
  const ref = item.scheduledFor || item.publishedAt || item.createdAt;
  if (!ref) {
    return '—';
  }
  return new Date(ref).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Props = {
  item: ContentItem;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  onApprove: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

export function PostListRow({ item, selected, onToggleSelected, onApprove, onDelete }: Props) {
  const thumb = getThumb(item);
  const videoUrl = getVideoUrl(item);
  const isVideo = isVideoContentType(item);
  const status = item.status ?? 'draft';
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.draft!;
  const isApproved = status === 'approved' || status === 'scheduled' || status === 'published';
  const platforms = item.targetPlatforms ?? [];

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-muted/30',
        selected && 'ring-2 ring-primary',
      )}
    >
      {/* Checkbox */}
      <div className="shrink-0">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelected(item.id)}
          aria-label={`Select post ${item.id}`}
        />
      </div>

      {/* Thumbnail chip 48x64 (3:4-ish) */}
      <Link
        href={`/dashboard/content/${item.id}`}
        className="relative block h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted"
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
                <div className="flex size-full items-center justify-center text-[9px] text-muted-foreground">
                  {ctLabel(item.contentType).slice(0, 4)}
                </div>
              )}
      </Link>

      {/* Caption + meta (min-w-0 required for line-clamp inside flex) */}
      <Link href={`/dashboard/content/${item.id}`} className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-snug text-foreground/90">
          {item.caption || <span className="italic text-muted-foreground">No caption</span>}
        </p>
        <div className="mt-1 flex items-center gap-2 text-micro text-muted-foreground">
          <span>{ctLabel(item.contentType)}</span>
          <span>·</span>
          <span>{formatDate(item)}</span>
        </div>
      </Link>

      {/* Status + platforms */}
      <div className="flex shrink-0 items-center gap-3">
        <span className={cn('hidden items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium sm:inline-flex', style.bg)}>
          <span className={cn('size-1.5 rounded-full', style.dot)} />
          {style.label}
        </span>
        <div className="hidden items-center gap-1 md:flex">
          {platforms.slice(0, 3).map(p => (
            <PlatformIcon key={p} platform={p} size="sm" />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {!isApproved && (
          <button
            type="button"
            onClick={() => onApprove(item.id)}
            className="hidden items-center gap-1 rounded-md bg-emerald-500 px-2 py-1 text-micro font-medium text-white transition-colors hover:bg-emerald-600 sm:inline-flex"
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
            {!isApproved && (
              <DropdownMenuItem onSelect={() => onApprove(item.id)}>
                <CheckCircle2 className="mr-2 size-3.5" />
                Approve
              </DropdownMenuItem>
            )}
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
  );
}

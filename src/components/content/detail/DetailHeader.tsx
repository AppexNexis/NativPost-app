'use client';

import { ArrowLeft, Edit3 } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ContentItem } from '@/types/v2';

import { ctLabel, getStatusMeta, MODE_CONFIG } from './status-config';

type Props = {
  item: ContentItem;
  editorHref: string;
};

export function DetailHeader({ item, editorHref }: Props) {
  const statusMeta = getStatusMeta(item.status);
  const modeMeta = item.contentMode ? MODE_CONFIG[item.contentMode] : null;
  const StatusIcon = statusMeta.icon;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusMeta.bg}`}
          >
            <StatusIcon className="size-3" />
            {statusMeta.label}
          </span>
          {modeMeta && (
            <Badge variant="secondary" className={modeMeta.bg}>{modeMeta.label}</Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {ctLabel(item.contentType)}
          </Badge>
          {item.aspectRatio && (
            <Badge variant="outline" className="text-[10px]">{item.aspectRatio}</Badge>
          )}
        </div>
        <h1 className="line-clamp-2 text-lg font-semibold leading-tight sm:text-xl">
          {item.caption
            ? item.caption.split('\n')[0]
            : <span className="italic text-muted-foreground">Untitled post</span>}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={editorHref}>
            <Edit3 className="mr-1.5 size-3.5" />
            Edit
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/posts">
            <ArrowLeft className="mr-1.5 size-3.5" />
            <span className="hidden sm:inline">All posts</span>
            <span className="sm:hidden">Back</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}

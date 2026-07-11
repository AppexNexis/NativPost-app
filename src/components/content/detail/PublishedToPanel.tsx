'use client';

import { AlertCircle, Check, Copy, ExternalLink, Loader2, RefreshCw, Send } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getPostUrl, PLATFORM_META } from '@/lib/social-post-url';

import { PlatformIcon } from '../preview-helpers';

export type Publication = {
  platform: string;
  status: string;
  platformPostId: string | null;
  permalink: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  platformUsername: string | null;
  platformUserId: string | null;
};

type Props = {
  publications: Publication[];
  onRetry?: (platform: string) => Promise<void> | void;
  isRetrying?: string | null;
};

function statusPill(status: string): { label: string; className: string } {
  switch (status) {
    case 'succeeded':
    case 'published':
    case 'completed':
      return { label: 'Published', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' };
    case 'failed':
    case 'error':
      return { label: 'Failed', className: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' };
    case 'processing':
    case 'in_progress':
      return { label: 'Processing', className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300' };
    case 'queued':
    case 'pending':
    default:
      return { label: 'Queued', className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300' };
  }
}

export function PublishedToPanel({ publications, onRetry, isRetrying }: Props) {
  const [copiedFor, setCopiedFor] = useState<string | null>(null);

  if (!publications || publications.length === 0) return null;

  const copy = (platform: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedFor(platform);
    setTimeout(() => setCopiedFor(null), 1500);
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 border-b pb-3">
        <Send className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Published to</h3>
      </div>
      <TooltipProvider>
        <div className="space-y-2.5">
          {publications.map((pub) => {
            const pill = statusPill(pub.status);
            const meta = PLATFORM_META[pub.platform] || { label: pub.platform, brandColor: '#6b7280' };
            const isPublished = pill.label === 'Published';
            const isFailed = pill.label === 'Failed';
            const isProcessing = pill.label === 'Processing' || pill.label === 'Queued';
            const { url, isFallback } = isPublished
              ? getPostUrl({
                  platform: pub.platform,
                  platformPostId: pub.platformPostId,
                  permalink: pub.permalink,
                  platformUsername: pub.platformUsername,
                  platformUserId: pub.platformUserId,
                })
              : { url: null, isFallback: false };

            return (
              <div key={pub.platform} className="flex flex-wrap items-center gap-2 rounded-md border bg-background/60 px-2.5 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <PlatformIcon platform={pub.platform} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{meta.label}</p>
                    {pub.platformUsername && (
                      <p className="truncate text-[11px] text-muted-foreground">@{pub.platformUsername}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${pill.className}`}>
                    {isProcessing && <Loader2 className="size-2.5 animate-spin" />}
                    {isFailed && <AlertCircle className="size-2.5" />}
                    {isPublished && <Check className="size-2.5" />}
                    {pill.label}
                  </span>

                  {isFailed && pub.errorMessage && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="Error details"
                          className="inline-flex size-6 items-center justify-center rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <AlertCircle className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs text-xs">
                        {pub.errorMessage}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {isFailed && onRetry && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1 px-2 text-[11px]"
                      onClick={() => onRetry(pub.platform)}
                      disabled={isRetrying === pub.platform}
                    >
                      {isRetrying === pub.platform
                        ? <Loader2 className="size-2.5 animate-spin" />
                        : <RefreshCw className="size-2.5" />}
                      Retry
                    </Button>
                  )}

                  {isPublished && url && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-6 gap-1 px-2 text-[11px]"
                          >
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="size-2.5" />
                              {isFallback ? 'Profile' : 'Open'}
                            </a>
                          </Button>
                        </TooltipTrigger>
                        {isFallback && (
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            Post permalink is not available for this Instagram publish. Opens the profile instead.
                          </TooltipContent>
                        )}
                      </Tooltip>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-6 p-0"
                        onClick={() => copy(pub.platform, url)}
                        aria-label={`Copy ${meta.label} link`}
                      >
                        {copiedFor === pub.platform
                          ? <Check className="size-3 text-emerald-500" />
                          : <Copy className="size-3" />}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    </Card>
  );
}

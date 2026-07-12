'use client';

import { Download, Loader2, X } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { getModel } from '@/lib/ai-studio/models';
import { cn } from '@/utils/Helpers';

export interface AiStudioJobView {
  id: string;
  modelId: string;
  kind: string;
  status: 'reserved' | 'queued' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
  input?: { prompt?: string; aspect?: string; duration?: number };
  output?: { url?: string; thumbnailUrl?: string; durationSec?: number };
  errorMessage?: string | null;
  creditsReserved: number;
  creditsCharged?: number | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CLASS: Record<AiStudioJobView['status'], string> = {
  reserved: 'bg-muted text-foreground',
  queued: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  processing: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  succeeded: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  failed: 'bg-destructive/10 text-destructive',
  canceled: 'bg-muted text-muted-foreground',
  refunded: 'bg-muted text-muted-foreground',
};

interface JobCardProps {
  job: AiStudioJobView;
  onCanceled?: () => void;
}

export function JobCard({ job, onCanceled }: JobCardProps) {
  const [busy, setBusy] = useState(false);
  const model = getModel(job.modelId);
  const inFlight = ['reserved', 'queued', 'processing'].includes(job.status);
  const isVideo = job.kind === 'video' || job.kind === 'video-lipsync';
  const outUrl = job.output?.url;
  const thumb = job.output?.thumbnailUrl ?? outUrl;

  async function cancel() {
    if (!confirm('Cancel this generation and refund credits?')) return;
    setBusy(true);
    try {
      await fetch(`/api/ai-studio/jobs/${job.id}/cancel`, { method: 'POST' });
      onCanceled?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="relative aspect-square bg-muted">
        {thumb && !inFlight
          ? isVideo && outUrl
            ? (
                <video
                  src={outUrl}
                  poster={job.output?.thumbnailUrl}
                  className="absolute inset-0 h-full w-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
              )
            : (
                <Image
                  src={thumb}
                  alt={job.input?.prompt ?? 'Generation'}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
                />
              )
          : (
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted/40" />
            )}
        <span
          className={cn(
            'absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            STATUS_CLASS[job.status],
          )}
        >
          {job.status}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <p className="line-clamp-2 text-xs text-foreground">{job.input?.prompt ?? 'No prompt'}</p>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{model?.label ?? job.modelId}</span>
          <span>{new Date(job.createdAt).toLocaleTimeString()}</span>
        </div>
        {job.status === 'failed' && job.errorMessage && (
          <p className="text-[11px] text-destructive">{job.errorMessage}</p>
        )}
        <div className="flex items-center gap-2">
          {job.status === 'succeeded' && outUrl && (
            <Button asChild size="sm" variant="secondary" className="h-7 flex-1">
              <a href={outUrl} target="_blank" rel="noopener noreferrer" download>
                <Download className="mr-1 h-3 w-3" /> Download
              </a>
            </Button>
          )}
          {inFlight && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 flex-1"
              onClick={cancel}
              disabled={busy}
            >
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <X className="mr-1 h-3 w-3" />}
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

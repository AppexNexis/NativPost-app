'use client';

import { BarChart3, Eye, Heart, MessageCircle, Share2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui/card';

import { formatCount } from './status-config';

type Props = {
  engagementData: Record<string, unknown>;
};

const METRIC_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  views: { icon: Eye, label: 'Views' },
  impressions: { icon: Eye, label: 'Impressions' },
  reach: { icon: Eye, label: 'Reach' },
  likes: { icon: Heart, label: 'Likes' },
  comments: { icon: MessageCircle, label: 'Comments' },
  shares: { icon: Share2, label: 'Shares' },
  saves: { icon: Heart, label: 'Saves' },
};

function humanizeKey(key: string): string {
  if (METRIC_ICONS[key]) return METRIC_ICONS[key]!.label;
  return key.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return Number(v);
  return null;
}

export function EngagementPanel({ engagementData }: Props) {
  const entries = Object.entries(engagementData || {}).filter(([, v]) => toNumber(v) !== null);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 border-b pb-3">
        <BarChart3 className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Engagement</h3>
      </div>
      {entries.length === 0
        ? (
            <p className="text-xs text-muted-foreground">
              Engagement data will appear here once the post has been live for a few hours.
            </p>
          )
        : (
            <div className="grid grid-cols-2 gap-2">
              {entries.map(([key, val]) => {
                const meta = METRIC_ICONS[key];
                const Icon = meta?.icon ?? BarChart3;
                const label = humanizeKey(key);
                const n = toNumber(val);
                return (
                  <div key={key} className="rounded-md border bg-background/60 p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      <Icon className="size-3" />
                      {label}
                    </div>
                    <p className="mt-1 text-lg font-semibold">{formatCount(n)}</p>
                  </div>
                );
              })}
            </div>
          )}
    </Card>
  );
}

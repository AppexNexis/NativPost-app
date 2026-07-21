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
  saved: { icon: Heart, label: 'Saves' },
  retweets: { icon: Share2, label: 'Retweets' },
  replies: { icon: MessageCircle, label: 'Replies' },
};

// Order metrics appear in when present, rest fall back to insertion order.
const METRIC_ORDER = ['impressions', 'reach', 'views', 'likes', 'comments', 'shares', 'saves', 'saved', 'retweets', 'replies'];

function humanizeKey(key: string): string {
  if (METRIC_ICONS[key]) return METRIC_ICONS[key]!.label;
  return key.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return Number(v);
  return null;
}

/**
 * engagementData is stored NESTED BY PLATFORM, e.g.
 *   { facebook: { likes, comments, shares, impressions },
 *     instagram: { likes, comments, shares, saved } }
 *
 * This sums each metric across every platform's sub-object into a single
 * flat totals map. Previously this component ran Object.entries() directly
 * on the nested object and tried toNumber() on each platform's *object*
 * value, which always failed — so every entry was silently filtered out
 * and the panel showed the empty state even when data existed upstream.
 */
function flattenAcrossPlatforms(engagementData: Record<string, unknown>): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const platformValue of Object.values(engagementData || {})) {
    if (!platformValue || typeof platformValue !== 'object') continue;
    for (const [metricKey, rawVal] of Object.entries(platformValue as Record<string, unknown>)) {
      const n = toNumber(rawVal);
      if (n === null) continue;
      totals[metricKey] = (totals[metricKey] || 0) + n;
    }
  }

  return totals;
}

export function EngagementPanel({ engagementData }: Props) {
  const totals = flattenAcrossPlatforms(engagementData);
  const entries = Object.entries(totals).sort(([a], [b]) => {
    const ai = METRIC_ORDER.indexOf(a);
    const bi = METRIC_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

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
                return (
                  <div key={key} className="rounded-md border bg-background/60 p-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      <Icon className="size-3" />
                      {label}
                    </div>
                    <p className="mt-1 text-lg font-semibold">{formatCount(val)}</p>
                  </div>
                );
              })}
            </div>
          )}
    </Card>
  );
}
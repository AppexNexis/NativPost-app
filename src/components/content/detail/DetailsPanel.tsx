'use client';

import { Calendar, ChevronRight, Info } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { ContentItem } from '@/types/v2';

import { ctLabel, formatDuration, PLATFORM_LABELS } from './status-config';

type Campaign = { id: string; name: string; reRollsRemaining?: number } | null;
type Template = { id: string; contentType?: string } | null;
type Influencer = { id: string; name: string } | null;
type Angle = { id: string; name: string; color?: string | null } | null;

type Props = {
  item: ContentItem;
  campaign: Campaign;
  template: Template;
  influencer: Influencer;
  angle: Angle;
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

export function DetailsPanel({ item, campaign, template, influencer, angle }: Props) {
  const platforms = (item.targetPlatforms || []).map(p => PLATFORM_LABELS[p] || p).join(', ') || '-';

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 border-b pb-3">
        <Info className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Details</h3>
      </div>
      <div className="divide-y divide-border/60">
        <Row label="Type" value={ctLabel(item.contentType)} />
        {item.topic && <Row label="Topic" value={item.topic} />}
        {item.contentMode && <Row label="Mode" value={ctLabel(item.contentMode)} />}
        <Row label="Platforms" value={platforms} />
        {item.aspectRatio && <Row label="Aspect ratio" value={item.aspectRatio} />}
        {item.durationSeconds && item.durationSeconds > 0 && (
          <Row label="Duration" value={formatDuration(item.durationSeconds)} />
        )}
        {item.aiModelUsed && <Row label="Model" value={item.aiModelUsed} />}
        {campaign && (
          <Row
            label="Campaign"
            value={<Link href={`/dashboard/campaigns/${campaign.id}`} className="text-primary hover:underline">{campaign.name}</Link>}
          />
        )}
        {template && (
          <Row
            label="Template"
            value={<Link href={`/dashboard/content-library?template=${template.id}`} className="text-primary hover:underline">View</Link>}
          />
        )}
        {influencer && <Row label="Influencer" value={influencer.name} />}
        {angle && (
          <Row
            label="Angle"
            value={
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: angle.color || '#6B7280' }}
              >
                {angle.name}
              </span>
            }
          />
        )}
      </div>
      <Separator className="my-3" />
      <div className="space-y-1 text-[11px] text-muted-foreground">
        <p>Created {new Date(item.createdAt).toLocaleString()}</p>
        {item.updatedAt && <p>Updated {new Date(item.updatedAt).toLocaleString()}</p>}
        {item.publishedAt && <p>Published {new Date(item.publishedAt).toLocaleString()}</p>}
      </div>
      {item.scheduledFor && (
        <Link
          href={`/dashboard/calendar?selected=${item.scheduledFor.split('T')[0]}`}
          className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Calendar className="size-3" />
          View on calendar
          <ChevronRight className="size-3" />
        </Link>
      )}
    </Card>
  );
}

'use client';

import type { LucideIcon } from 'lucide-react';
import { AtSign, ExternalLink, Link2, Mail, Percent, Tag } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

type EnrichmentShape = {
  cta_url?: string;
  cta_label?: string;
  reference_links?: string[];
  contact_info?: string;
  promo_code?: string;
  event_details?: string;
  custom_mentions?: string[];
};

type Props = {
  enrichment: EnrichmentShape;
  applied: string[];
};

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="size-3.5 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-0.5 break-words text-sm">{children}</div>
      </div>
    </div>
  );
}

export function EnrichmentPanel({ enrichment, applied }: Props) {
  const hasAny = !!(
    enrichment.cta_url
    || enrichment.promo_code
    || enrichment.contact_info
    || enrichment.event_details
    || (enrichment.reference_links?.length ?? 0) > 0
    || (enrichment.custom_mentions?.length ?? 0) > 0
  );
  if (!hasAny) {
    return null;
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 border-b pb-3">
        <Link2 className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Post enrichment</h3>
        {applied?.length > 0 && (
          <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            {applied.length}
            {' '}
            applied
          </span>
        )}
      </div>
      <div className="divide-y divide-border/60">
        {enrichment.cta_url && (
          <Row icon={ExternalLink} label="Call to action">
            <a
              href={enrichment.cta_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {enrichment.cta_label || 'Learn more'}
              <ExternalLink className="size-3" />
            </a>
            <p className="mt-0.5 truncate text-micro text-muted-foreground">{enrichment.cta_url}</p>
          </Row>
        )}
        {enrichment.promo_code && (
          <Row icon={Percent} label="Promo code">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{enrichment.promo_code}</span>
          </Row>
        )}
        {enrichment.event_details && (
          <Row icon={Tag} label="Event details">
            <p className="text-sm">{enrichment.event_details}</p>
          </Row>
        )}
        {enrichment.contact_info && (
          <Row icon={Mail} label="Contact">
            <p className="text-sm">{enrichment.contact_info}</p>
          </Row>
        )}
        {enrichment.reference_links && enrichment.reference_links.length > 0 && (
          <Row icon={Link2} label="Reference links">
            <ul className="space-y-0.5">
              {enrichment.reference_links.map(l => (
                <li key={l}>
                  <a href={l} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-primary hover:underline">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </Row>
        )}
        {enrichment.custom_mentions && enrichment.custom_mentions.length > 0 && (
          <Row icon={AtSign} label="Mentions">
            <p className="text-sm">{enrichment.custom_mentions.join(' ')}</p>
          </Row>
        )}
      </div>
      <Separator className="my-3" />
      <p className="text-micro text-muted-foreground">
        Enrichment is appended to the caption at publish time.
      </p>
    </Card>
  );
}

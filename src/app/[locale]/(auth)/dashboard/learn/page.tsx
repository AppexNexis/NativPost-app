import { ArrowRight, Clock, PlayCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { GuideVideo } from '@/components/learn/GuideVideo';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { getFeaturedGuide, getGroupedGuides, getGuideNumbers } from '@/lib/learn/registry';
import { CATEGORY_LABELS } from '@/lib/learn/types';

export const metadata: Metadata = {
  title: 'Learn',
  description: 'Guides and videos for getting the most out of NativPost.',
};

export default function LearnPage() {
  const featured = getFeaturedGuide();
  const groups = getGroupedGuides();
  const numbers = getGuideNumbers();

  return (
    <>
      <PageHeader
        title="Learning center"
        description="Everything you need to know about using NativPost — from first setup to campaigns, managed accounts and the API."
      />

      {/* ── Hero: the start-here guide ─────────────────────────────── */}
      <Link
        href={`/dashboard/learn/${featured.slug}`}
        className="group mb-10 grid overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary/40 md:grid-cols-2"
      >
        <div className="relative aspect-video md:aspect-auto md:min-h-[240px]">
          {featured.video
            ? (
                <GuideVideo video={featured.video} rounded="rounded-none" className="absolute inset-0 size-full" />
              )
            : (
                <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/25 via-muted to-muted">
                  <PlayCircle className="size-10 text-primary/60" />
                </div>
              )}
        </div>

        <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
          <span className="w-fit rounded-full bg-primary/10 px-2.5 py-1 text-label font-semibold uppercase tracking-wide text-primary">
            Start here
          </span>
          <h2 className="font-display text-title text-foreground">{featured.title}</h2>
          <p className="text-body leading-relaxed text-muted-foreground">{featured.summary}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 text-body font-medium text-primary">
            {featured.video ? 'Watch the overview' : 'Read the overview'}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>

      {/* ── Categories ─────────────────────────────────────────────── */}
      <div className="space-y-10">
        {groups.map(group => (
          <section key={group.category}>
            <h2 className="mb-3 border-b pb-2 text-label font-semibold uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABELS[group.category]}
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
              {group.guides.map(guide => (
                <Link
                  key={guide.slug}
                  href={`/dashboard/learn/${guide.slug}`}
                  className="group flex gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <span className="mt-0.5 font-mono text-meta font-semibold text-muted-foreground/60">
                    {numbers.get(guide.slug)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-1.5 text-body font-semibold text-foreground">
                      <span className="min-w-0">{guide.title}</span>
                      {guide.video && <PlayCircle className="size-3.5 shrink-0 text-primary/70" />}
                    </h3>
                    <p className="mt-1 text-meta leading-relaxed text-muted-foreground">
                      {guide.summary}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-micro text-muted-foreground/70">
                      <Clock className="size-3" />
                      {guide.readingMinutes}
                      {' '}
                      min read
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

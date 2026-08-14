import { ArrowLeft, ArrowRight, BookOpen, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GuideBody } from '@/components/learn/GuideBody';
import { GuideVideo } from '@/components/learn/GuideVideo';
import { TableOfContents } from '@/components/learn/TableOfContents';
import { GUIDES, getGuide, getReadNext } from '@/lib/learn/registry';

type Props = { params: Promise<{ slug: string }> };

/** Guides are static content — prerender every one. */
export function generateStaticParams() {
  return GUIDES.map(g => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) {
    return { title: 'Guide not found' };
  }
  return { title: guide.title, description: guide.summary };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = getGuide(slug);

  if (!guide) {
    notFound();
  }

  const readNext = getReadNext(guide);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/dashboard/learn"
        className="mb-6 inline-flex items-center gap-1.5 text-meta text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        <BookOpen className="size-3.5" />
        Learning center
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
        {/* ── Article ───────────────────────────────────────────── */}
        <article className="min-w-0">
          <h1 className="font-display text-display text-foreground">{guide.title}</h1>

          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{guide.summary}</p>

          <p className="mt-4 inline-flex items-center gap-1.5 text-meta text-muted-foreground/70">
            <Clock className="size-3.5" />
            {guide.readingMinutes}
            {' '}
            min read
          </p>

          {guide.video && (
            <GuideVideo video={guide.video} className="mt-6 aspect-video w-full" />
          )}

          <div className="mt-10">
            <GuideBody sections={guide.sections} />
          </div>

          {/* Read next — inline on narrow screens, where the sidebar is gone. */}
          {readNext.length > 0 && (
            <section className="mt-12 border-t pt-6 lg:hidden">
              <h2 className="mb-3 text-label font-semibold uppercase tracking-wide text-muted-foreground">
                Read next
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {readNext.map(next => (
                  <Link
                    key={next.slug}
                    href={`/dashboard/learn/${next.slug}`}
                    className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <p className="text-body font-semibold text-foreground">{next.title}</p>
                    <p className="mt-1 line-clamp-2 text-meta text-muted-foreground">{next.summary}</p>
                    <span className="mt-2 inline-flex items-center gap-1 text-meta font-medium text-primary">
                      Read
                      <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>

        {/* ── Sidebar: contents + read next ─────────────────────── */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-8">
            <TableOfContents sections={guide.sections} />

            {readNext.length > 0 && (
              <div>
                <p className="mb-3 text-label font-semibold uppercase tracking-wide text-muted-foreground">
                  Read next
                </p>
                <ul className="space-y-2">
                  {readNext.map(next => (
                    <li key={next.slug}>
                      <Link
                        href={`/dashboard/learn/${next.slug}`}
                        className="block text-meta text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {next.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

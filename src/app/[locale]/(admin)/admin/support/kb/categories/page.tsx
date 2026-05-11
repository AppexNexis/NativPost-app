'use client';

/**
 * src/app/[locale]/(admin)/admin/support/kb/categories/page.tsx
 *
 * Knowledge base category overview.
 * Shows article counts per category, quick links to filter by category.
 */

import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type CategoryStat = {
  category: string;
  count: number;
};

const CATEGORIES = [
  { value: 'billing',         label: 'Billing',          description: 'Plans, payments, invoices, and upgrades.' },
  { value: 'features',        label: 'Features',         description: 'How NativPost features work.' },
  { value: 'integrations',    label: 'Integrations',     description: 'Connecting social platforms and third-party tools.' },
  { value: 'troubleshooting', label: 'Troubleshooting',  description: 'Diagnosing and fixing common issues.' },
  { value: 'account',         label: 'Account',          description: 'Profile, team, and account management.' },
  { value: 'getting_started', label: 'Getting started',  description: 'Onboarding and first steps with NativPost.' },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  billing:         { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200' },
  features:        { bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-200' },
  integrations:    { bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200' },
  troubleshooting: { bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200' },
  account:         { bg: 'bg-zinc-100',   text: 'text-zinc-700',   border: 'border-zinc-200' },
  getting_started: { bg: 'bg-teal-50',    text: 'text-teal-700',   border: 'border-teal-200' },
};

export default function KBCategoriesPage() {
  const [stats,   setStats]   = useState<CategoryStat[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/support/kb')
      .then((r) => r.json())
      .then((data) => {
        const s: CategoryStat[] = data.categoryStats ?? [];
        setStats(s);
        setTotal(s.reduce((sum, c) => sum + Number(c.count), 0));
      })
      .finally(() => setLoading(false));
  }, []);

  const getCount = (cat: string) =>
    Number(stats.find((s) => s.category === cat)?.count ?? 0);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">KB Categories</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total} total articles across {CATEGORIES.length} categories
          </p>
        </div>
        <Link
          href="/admin/support/kb"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <BookOpen className="size-4" />
          Manage articles
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const count  = getCount(cat.value);
            const colors = CATEGORY_COLORS[cat.value];

            return (
              <Link
                key={cat.value}
                href={`/admin/support/kb?category=${cat.value}`}
                className="group rounded-xl border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between">
                  <span className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${colors?.bg ?? ''} ${colors?.text ?? ''} ${colors?.border ?? ''}`}>
                    {cat.label}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="text-3xl font-semibold">{count}</p>
                <p className="text-sm font-medium">
                  {count === 1 ? '1 article' : `${count} articles`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{cat.description}</p>

                {count === 0 && (
                  <p className="mt-3 flex items-center gap-1 text-xs text-primary">
                    <ArrowRight className="size-3" />
                    Add the first article
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Coverage tip */}
      {!loading && total < 10 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">Build out your knowledge base</p>
          <p className="mt-0.5 text-xs text-amber-700">
            The AI uses these articles to auto-resolve support tickets. More articles mean higher
            auto-resolve rates and faster responses for clients. Aim for at least 3 articles per
            category covering your most common support questions.
          </p>
          <Link
            href="/admin/support/kb"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline"
          >
            <BookOpen className="size-3" />
            Add articles now
          </Link>
        </div>
      )}
    </div>
  );
}
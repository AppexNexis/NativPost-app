'use client';

import { Loader2, Plus, Sparkles, UserRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { EmptyState } from '@/features/dashboard/EmptyState';
import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { LoadingState } from '@/features/dashboard/LoadingState';
import { PageHeader } from '@/features/dashboard/PageHeader';

type Influencer = {
  id: string;
  orgId: string | null;
  name: string;
  description: string | null;
  gender: string | null;
  ageRange: string | null;
  ethnicity: string | null;
  baseImageUrl: string | null;
  referenceImageUrls: string[] | null;
  loraStatus: string | null;
  loraModelId: string | null;
  isSystem: boolean | null;
  isActive: boolean | null;
  usageCount: number | null;
  createdAt: string;
};

type Tab = 'mine' | 'library';

export default function InfluencersPage() {
  const [items, setItems] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('mine');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/ai-influencers', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Failed to load influencers (${res.status})`);
        }
        const data = await res.json();
        if (!cancelled) {
          setItems(data.items ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const mine = useMemo(() => items.filter(i => !i.isSystem && i.isActive), [items]);
  const library = useMemo(() => items.filter(i => i.isSystem), [items]);
  const visible = tab === 'mine' ? mine : library;

  if (loading) {
    return <LoadingState message="Loading influencers" />;
  }

  return (
    <>
      <PageHeader
        title="Influencers"
        description="Create face-locked AI creators that appear consistently across your Blitz feed, campaigns, and posts."
        actions={(
          <Link
            href="/dashboard/influencers/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={16} />
            New Influencer
          </Link>
        )}
      />

      {error && <ErrorBanner title="Failed to load influencers" detail={error} />}

      <div className="mb-4 flex items-center gap-2 border-b border-border">
        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')} label={`Yours (${mine.length})`} />
        <TabButton active={tab === 'library'} onClick={() => setTab('library')} label={`Library (${library.length})`} />
      </div>

      {visible.length === 0
        ? (
            tab === 'mine'
              ? (
                  <EmptyState
                    icon={UserRound}
                    title="Create your first AI influencer"
                    description="Pick traits, upload a few reference photos, add a voice — and NativPost will train a face-locked persona that appears consistently across every post."
                    primary={{ label: 'Create Influencer', href: '/dashboard/influencers/new' }}
                    secondary={{ label: 'Browse the library', onClick: () => setTab('library') }}
                  />
                )
              : (
                  <EmptyState
                    icon={Sparkles}
                    title="Baseline library empty"
                    description="No shared personas yet. Ask an admin to seed the baseline library."
                  />
                )
          )
        : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map(item => (
                <InfluencerCard key={item.id} item={item} />
              ))}
            </div>
          )}
    </>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function InfluencerCard({ item }: { item: Influencer }) {
  const traitLine = [item.gender, item.ageRange, item.ethnicity].filter(Boolean).join(' · ');

  return (
    <Link
      href={`/dashboard/influencers/${item.id}`}
      className="group overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary hover:shadow-md"
    >
      <div className="relative aspect-square bg-muted">
        {item.baseImageUrl
          ? (
              <Image
                src={item.baseImageUrl}
                alt={item.name}
                fill
                sizes="(max-width: 640px) 100vw, 25vw"
                className="object-cover"
              />
            )
          : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <UserRound size={48} />
              </div>
            )}
        <TrainingStatusBadge status={item.loraStatus} />
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium">{item.name}</div>
        {traitLine && <div className="mt-0.5 truncate text-xs text-muted-foreground">{traitLine}</div>}
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {item.usageCount ?? 0}
            {' '}
            posts
          </span>
          {item.isSystem && <span className="rounded-full bg-accent px-2 py-0.5">Library</span>}
        </div>
      </div>
    </Link>
  );
}

function TrainingStatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'pending') {
    return null;
  }
  if (status === 'training') {
    return (
      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-xs font-medium text-white">
        <Loader2 size={10} className="animate-spin" />
        Training
      </span>
    );
  }
  if (status === 'ready') {
    return (
      <span className="absolute right-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-xs font-medium text-white">
        Ready
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="absolute right-2 top-2 rounded-full bg-red-500/90 px-2 py-0.5 text-xs font-medium text-white">
        Failed
      </span>
    );
  }
  return null;
}

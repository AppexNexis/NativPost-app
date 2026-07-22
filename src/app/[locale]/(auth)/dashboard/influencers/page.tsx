'use client';

import { Loader2, Plus, Search, Sparkles, UserRound, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
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
  trainingMode: string | null;
  isSystem: boolean | null;
  isActive: boolean | null;
  usageCount: number | null;
  createdAt: string;
};

const GENDER_OPTIONS = ['female', 'male', 'non-binary'];
const AGE_OPTIONS = ['18-24', '25-34', '35-44', '45-54', '55+'];
const ETHNICITY_OPTIONS = ['east asian', 'south asian', 'black', 'white', 'hispanic', 'middle eastern', 'mixed'];
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ready', label: 'Ready' },
  { value: 'instant', label: 'Instant' },
  { value: 'training', label: 'Training' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'most-used', label: 'Most used' },
  { value: 'alphabetical', label: 'A to Z' },
];

export default function InfluencersPage() {
  const [items, setItems] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useQueryState('tab', parseAsString.withDefault('mine'));
  const [q, setQ] = useQueryState('q', parseAsString.withDefault(''));
  const [genderFilter, setGenderFilter] = useQueryState('gender', parseAsArrayOf(parseAsString).withDefault([]));
  const [ageFilter, setAgeFilter] = useQueryState('age', parseAsArrayOf(parseAsString).withDefault([]));
  const [ethnicityFilter, setEthnicityFilter] = useQueryState('ethnicity', parseAsArrayOf(parseAsString).withDefault([]));
  const [statusFilter, setStatusFilter] = useQueryState('status', parseAsArrayOf(parseAsString).withDefault([]));
  const [sort, setSort] = useQueryState('sort', parseAsString.withDefault('newest'));

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
  const source = tab === 'library' ? library : mine;

  const filtered = useMemo(() => {
    let list = source;
    const qLower = q.trim().toLowerCase();
    if (qLower) {
      list = list.filter((i) => {
        const hay = [i.name, i.description, i.gender, i.ageRange, i.ethnicity].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(qLower);
      });
    }
    if (genderFilter.length > 0) {
      list = list.filter(i => i.gender && genderFilter.includes(i.gender));
    }
    if (ageFilter.length > 0) {
      list = list.filter(i => i.ageRange && ageFilter.includes(i.ageRange));
    }
    if (ethnicityFilter.length > 0) {
      list = list.filter(i => i.ethnicity && ethnicityFilter.includes(i.ethnicity));
    }
    if (statusFilter.length > 0) {
      list = list.filter((i) => {
        if (statusFilter.includes('instant') && i.loraStatus === 'ready' && i.trainingMode === 'nano_banana') {
          return true;
        }
        if (statusFilter.includes('ready') && i.loraStatus === 'ready' && i.trainingMode !== 'nano_banana') {
          return true;
        }
        return i.loraStatus ? statusFilter.includes(i.loraStatus) : statusFilter.includes('pending');
      });
    }
    const sorted = [...list];
    switch (sort) {
      case 'oldest':
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'most-used':
        sorted.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0));
        break;
      case 'alphabetical':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'newest':
      default:
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }
    return sorted;
  }, [source, q, genderFilter, ageFilter, ethnicityFilter, statusFilter, sort]);

  const activeFilterCount
    = genderFilter.length + ageFilter.length + ethnicityFilter.length + statusFilter.length + (q.trim() ? 1 : 0);

  function clearAll() {
    setQ('');
    setGenderFilter([]);
    setAgeFilter([]);
    setEthnicityFilter([]);
    setStatusFilter([]);
  }

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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value || '')}
            placeholder="Search by name, description, or traits"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-body text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
            Clear (
            {activeFilterCount}
            )
          </button>
        )}
      </div>

      <FilterRow label="Gender" options={GENDER_OPTIONS} value={genderFilter} onChange={setGenderFilter} />
      <FilterRow label="Age" options={AGE_OPTIONS} value={ageFilter} onChange={setAgeFilter} />
      <FilterRow label="Ethnicity" options={ETHNICITY_OPTIONS} value={ethnicityFilter} onChange={setEthnicityFilter} />
      <FilterRow
        label="Status"
        options={STATUS_OPTIONS.map(o => o.value)}
        labels={Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label]))}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      {filtered.length === 0
        ? (
            tab === 'mine' && activeFilterCount === 0
              ? (
                  <EmptyState
                    icon={UserRound}
                    title="Create your first AI influencer"
                    description="Pick traits, upload a few reference photos, add a voice, and NativPost will train a face-locked persona that appears consistently across every post."
                    primary={{ label: 'Create Influencer', href: '/dashboard/influencers/new' }}
                    secondary={{ label: 'Browse the library', onClick: () => setTab('library') }}
                  />
                )
              : (
                  <EmptyState
                    icon={Sparkles}
                    title={activeFilterCount > 0 ? 'No influencers match these filters' : 'Baseline library empty'}
                    description={activeFilterCount > 0 ? 'Try clearing filters or searching a different term.' : 'No shared personas yet. Ask an admin to seed the baseline library.'}
                    {...(activeFilterCount > 0 ? { secondary: { label: 'Clear filters', onClick: clearAll } } : {})}
                  />
                )
          )
        : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map(item => (
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

function FilterRow({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  labels?: Record<string, string>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter(v => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={`rounded-full border px-2.5 py-0.5 text-xs capitalize transition ${
            value.includes(opt)
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
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
        <TrainingStatusBadge status={item.loraStatus} trainingMode={item.trainingMode} />
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium">{item.name}</div>
        {traitLine && <div className="mt-0.5 truncate text-meta text-muted-foreground">{traitLine}</div>}
        <div className="mt-2 flex items-center justify-between text-meta text-muted-foreground">
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

function TrainingStatusBadge({ status, trainingMode: tm }: { status: string | null; trainingMode?: string | null }) {
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
    const label = tm === 'nano_banana' ? 'Instant' : 'Ready';
    const color = tm === 'nano_banana'
      ? 'bg-blue-500/90'
      : 'bg-emerald-500/90';
    return (
      <span className={`absolute right-2 top-2 rounded-full ${color} px-2 py-0.5 text-xs font-medium text-white`}>
        {label}
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

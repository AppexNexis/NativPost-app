'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  Mic,
  Sparkles,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  hairStyle: string | null;
  hairColor: string | null;
  bodyType: string | null;
  fashionStyle: string | null;
  poseStyle: string | null;
  backgroundPreference: string | null;
  baseImageUrl: string | null;
  referenceImageUrls: string[] | null;
  loraStatus: string | null;
  loraModelId: string | null;
  loraTrainingJobId: string | null;
  voiceId: string | null;
  voiceProvider: string | null;
  personaPrompt: string | null;
  archetype: string | null;
  isSystem: boolean | null;
  isActive: boolean | null;
  usageCount: number | null;
  createdAt: string;
};

export default function InfluencerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [item, setItem] = useState<Influencer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [generating, setGenerating] = useState<'image' | 'consistency' | 'retrain' | 'delete' | null>(null);
  const [consistencyResults, setConsistencyResults] = useState<string[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/ai-influencers/${id}`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load influencer (${res.status})`);
      }
      const data = await res.json();
      setItem(data.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll LoRA training status while it's training
  useEffect(() => {
    if (!id) return;
    if (!item || item.loraStatus !== 'training') {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/ai-influencers/${id}/train-lora`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.loraStatus && data.loraStatus !== 'training') {
          load();
          return;
        }
      } catch {
        // swallow — next tick will retry
      }
      if (!cancelled) {
        pollTimer.current = setTimeout(poll, 6000);
      }
    }
    pollTimer.current = setTimeout(poll, 6000);

    return () => {
      cancelled = true;
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [id, item, load]);

  async function handleGenerateImage() {
    if (generating || !id) return;
    setGenerating('image');
    setActionMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/ai-influencers/${id}/generate-image`, { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Generate failed (${res.status})`);
      }
      setActionMsg('New base image generated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(null);
    }
  }

  async function handleTestConsistency() {
    if (generating || !id) return;
    setGenerating('consistency');
    setActionMsg(null);
    setError(null);
    setConsistencyResults(null);
    try {
      const res = await fetch(`/api/ai-influencers/${id}/test-consistency`, { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Consistency test failed (${res.status})`);
      }
      const data = await res.json();
      const urls: string[] = Array.isArray(data.imageUrls)
        ? data.imageUrls
        : Array.isArray(data.results)
          ? data.results.map((r: { imageUrl?: string }) => r.imageUrl).filter(Boolean)
          : [];
      setConsistencyResults(urls);
      setActionMsg(urls.length > 0 ? `${urls.length} consistency images generated.` : 'Consistency test complete.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(null);
    }
  }

  async function handleRetrain() {
    if (generating || !id) return;
    setGenerating('retrain');
    setActionMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/ai-influencers/${id}/train-lora`, { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Training failed (${res.status})`);
      }
      setActionMsg('Training started. This usually takes a few minutes.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(null);
    }
  }

  async function handleDelete() {
    if (generating || !id) return;
    setGenerating('delete');
    setActionMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/ai-influencers/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Delete failed (${res.status})`);
      }
      router.push('/dashboard/influencers');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGenerating(null);
    }
  }

  if (loading) {
    return <LoadingState message="Loading influencer" />;
  }

  if (!item) {
    return (
      <>
        <PageHeader title="Influencer" description="" />
        <ErrorBanner title="Influencer not found" detail={error || undefined} />
        <Link
          href="/dashboard/influencers"
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <ArrowLeft size={16} />
          Back to Influencers
        </Link>
      </>
    );
  }

  const isSystem = !!item.isSystem;
  const refs = item.referenceImageUrls || [];
  const traitPairs = buildTraitPairs(item);

  return (
    <>
      <PageHeader
        title={item.name}
        description={item.description || (isSystem ? 'Baseline library persona.' : 'Face-locked AI creator.')}
        actions={(
          <Link
            href="/dashboard/influencers"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
        )}
      />

      {error && <ErrorBanner title="Something went wrong" detail={error} onDismiss={() => setError(null)} />}
      {actionMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
          <CheckCircle2 size={14} />
          {actionMsg}
        </div>
      )}

      <LoraBanner status={item.loraStatus} loraModelId={item.loraModelId} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: base image + reference grid */}
        <div className="lg:col-span-2 space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 text-sm font-medium">Base image</div>
            <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-md bg-muted">
              {item.baseImageUrl
                ? (
                    <Image
                      src={item.baseImageUrl}
                      alt={item.name}
                      fill
                      sizes="(max-width: 1024px) 100vw, 33vw"
                      className="object-cover"
                    />
                  )
                : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <UserRound size={64} />
                    </div>
                  )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">
                Reference photos
                {' '}
                <span className="text-muted-foreground">
                  (
                  {refs.length}
                  )
                </span>
              </div>
            </div>
            {refs.length === 0
              ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No reference photos.
                  </div>
                )
              : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                    {refs.map((url, i) => (
                      <div key={url + i} className="relative aspect-square overflow-hidden rounded-md border border-border">
                        <Image
                          src={url}
                          alt={`Reference ${i + 1}`}
                          fill
                          sizes="(max-width: 640px) 33vw, 20vw"
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
          </section>

          {consistencyResults && consistencyResults.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 text-sm font-medium">Latest consistency test</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {consistencyResults.map((url, i) => (
                  <div key={url + i} className="relative aspect-square overflow-hidden rounded-md border border-border">
                    <Image
                      src={url}
                      alt={`Consistency ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, 20vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right: traits, voice, persona, actions */}
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 text-sm font-medium">Traits</div>
            <dl className="space-y-2 text-sm">
              {traitPairs.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className="truncate text-right capitalize">{v}</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">Posts</dt>
                <dd className="text-right">{item.usageCount ?? 0}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Mic size={14} />
              Voice
            </div>
            {item.voiceId
              ? (
                  <div className="text-sm">
                    <div className="capitalize">{item.voiceProvider || 'elevenlabs'}</div>
                    <div className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <span className="truncate">{item.voiceId}</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(item.voiceId!)}
                        className="shrink-0 rounded p-1 hover:bg-muted"
                        aria-label="Copy voice ID"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                )
              : (
                  <div className="text-sm text-muted-foreground">No voice selected.</div>
                )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <UserRound size={14} />
              Persona prompt
            </div>
            {item.personaPrompt
              ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.personaPrompt}</p>
                )
              : (
                  <div className="text-sm text-muted-foreground">No persona prompt.</div>
                )}
          </section>

          {!isSystem && (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 text-sm font-medium">Actions</div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGenerateImage}
                  disabled={generating !== null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {generating === 'image' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {generating === 'image' ? 'Generating…' : 'Generate base image'}
                </button>

                <button
                  type="button"
                  onClick={handleTestConsistency}
                  disabled={generating !== null || item.loraStatus !== 'ready'}
                  title={item.loraStatus !== 'ready' ? 'Train the LoRA first' : ''}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  {generating === 'consistency' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {generating === 'consistency' ? 'Testing…' : 'Test consistency'}
                </button>

                {(item.loraStatus === 'failed' || item.loraStatus === 'pending' || !item.loraStatus) && refs.length >= 3 && (
                  <button
                    type="button"
                    onClick={handleRetrain}
                    disabled={generating !== null}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    {generating === 'retrain' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {item.loraStatus === 'failed' ? 'Retry training' : 'Start training'}
                  </button>
                )}

                {!confirmDelete
                  ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        disabled={generating !== null}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        Delete influencer
                      </button>
                    )
                  : (
                      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                        <div className="mb-2 text-xs text-destructive">This cannot be undone.</div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleDelete}
                            disabled={generating !== null}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50"
                          >
                            {generating === 'delete' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(false)}
                            disabled={generating !== null}
                            className="inline-flex flex-1 items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function buildTraitPairs(item: Influencer): [string, string][] {
  const pairs: [string, string][] = [];
  if (item.gender) pairs.push(['Gender', item.gender]);
  if (item.ageRange) pairs.push(['Age', item.ageRange]);
  if (item.ethnicity) pairs.push(['Ethnicity', item.ethnicity]);
  const hair = [item.hairColor, item.hairStyle].filter(Boolean).join(' ');
  if (hair) pairs.push(['Hair', hair]);
  if (item.bodyType) pairs.push(['Body', item.bodyType]);
  if (item.fashionStyle) pairs.push(['Fashion', item.fashionStyle]);
  if (item.poseStyle) pairs.push(['Pose', item.poseStyle]);
  if (item.backgroundPreference) pairs.push(['Background', item.backgroundPreference]);
  return pairs;
}

function LoraBanner({ status, loraModelId }: { status: string | null; loraModelId: string | null }) {
  if (!status || status === 'pending') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <Sparkles size={14} />
        LoRA not trained yet. Add 3+ reference photos and start training to lock the face.
      </div>
    );
  }
  if (status === 'training') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
        <Loader2 size={14} className="animate-spin" />
        Training face lock. This typically takes 3-10 minutes. You can leave this page.
      </div>
    );
  }
  if (status === 'ready') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={14} />
        Face lock ready.
        {loraModelId && (
          <span className="ml-1 truncate font-mono text-xs opacity-70">
            {loraModelId.slice(0, 40)}
            …
          </span>
        )}
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <XCircle size={14} />
        Face-lock training failed. Retry with different reference photos.
      </div>
    );
  }
  return null;
}

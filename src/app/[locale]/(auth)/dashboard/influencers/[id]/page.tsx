'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Film,
  Loader2,
  Mic,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  Wand2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { LoadingState } from '@/features/dashboard/LoadingState';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { estimateCredits, getModel } from '@/lib/ai-studio/models';

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
  trainingMode: string | null;
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
  const [videoScript, setVideoScript] = useState('');
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoAspect, setVideoAspect] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [videoJobStatus, setVideoJobStatus] = useState<string | null>(null);
  const [trainingMode, setTrainingMode] = useState<'flux_lora' | 'nano_banana'>('flux_lora');
  const [videoJobResult, setVideoJobResult] = useState<{ url?: string; thumbnailUrl?: string } | null>(null);
  const [cloning, setCloning] = useState(false);
  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchScripts, setBatchScripts] = useState<Array<{ angleId: string; angleName: string; hookText: string; bodyText: string; ctaText: string; script: string }>>([]);
  const [batchVideoJobs, setBatchVideoJobs] = useState<Map<string, { jobId: string; status: string; thumbnailUrl?: string }>>(new Map());
  const [clips, setClips] = useState<Array<{ id: string; url: string; thumbnailUrl: string | null }>>([]);
  const [analytics, setAnalytics] = useState<{ totalPosts: number; totalEngagement: number; topPlatform: string } | null>(null);
  const [scriptTopic, setScriptTopic] = useState('');
  const [assignedAngles, setAssignedAngles] = useState<Array<{ assignmentId: string; angleId: string; name: string; description: string | null; color: string | null; weight: number }>>([]);
  const [angleSearchOpen, setAngleSearchOpen] = useState(false);
  const [angleSearchQ, setAngleSearchQ] = useState('');
  const [availableAngles, setAvailableAngles] = useState<Array<{ id: string; name: string; description: string | null; color: string | null }>>([]);
  const [voices, setVoices] = useState<Array<{ id: string; name: string; gender: string | null; accent: string | null; vibe: string | null; previewUrl: string | null; isClone: boolean }>>([]);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const videoCredits = useMemo(() => {
    const klingModel = getModel('kling-v3-turbo-pro-i2v');
    const lipsyncModel = getModel('veed-lipsync');
    const klingCredits = klingModel ? estimateCredits(klingModel, { seconds: videoDuration }) : 80;
    const lipsyncCredits = lipsyncModel ? estimateCredits(lipsyncModel) : 30;
    return klingCredits + lipsyncCredits;
  }, [videoDuration]);

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
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
    loadAngles();
    fetch('/api/ai-influencers/voices', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.voices) {
          setVoices(data.voices);
        }
      })
      .catch(() => {});
  }, [load]);

  const currentVoice = useMemo(() => voices.find(v => v.id === item?.voiceId), [voices, item?.voiceId]);

  function toggleVoicePreview() {
    if (!currentVoice?.previewUrl) {
      return;
    }
    if (voicePlaying) {
      voiceAudioRef.current?.pause();
      setVoicePlaying(false);
      return;
    }
    const a = new Audio(currentVoice.previewUrl);
    voiceAudioRef.current = a;
    a.onended = () => setVoicePlaying(false);
    a.onerror = () => setVoicePlaying(false);
    a.play().then(() => setVoicePlaying(true)).catch(() => setVoicePlaying(false));
  }

  // Poll training status while it's training
  useEffect(() => {
    if (!id) {
      return;
    }
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
        const res = await fetch(`/api/ai-influencers/${id}/lora-status`, { cache: 'no-store' });
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (cancelled) {
          return;
        }
        if (data.status === 'ready' || data.status === 'failed') {
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

  // Load analytics for this influencer
  useEffect(() => {
    if (!id || item?.isSystem || !item) {
      return;
    }
    let cancelled = false;
    fetch(`/api/analytics/influencers?orgId=${encodeURIComponent(item.orgId || '')}`, { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.influencers) {
          const match = (data.influencers as any[]).find((inf: any) => inf.id === id);
          if (match) {
            setAnalytics({ totalPosts: match.totalPosts || 0, totalEngagement: match.totalEngagement || 0, topPlatform: match.topPlatform || '—' });
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, item]);

  // Load generated clips for the gallery
  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    fetch(`/api/ai-influencers/${id}/media`, { cache: 'no-store' })
      .then(res => res.json())
      .then((data) => {
        if (!cancelled) {
          setClips(data.items || []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleGenerateImage() {
    if (generating || !id) {
      return;
    }
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
    if (generating || !id) {
      return;
    }
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
    if (generating || !id) {
      return;
    }
    setGenerating('retrain');
    setActionMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/ai-influencers/${id}/train-lora`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingMode }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Training failed (${res.status})`);
      }
      if (trainingMode === 'nano_banana') {
        setActionMsg('Identity ready! Your influencer is set up with Instant Identity.');
      } else {
        setActionMsg('Training started. This usually takes a few minutes.');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(null);
    }
  }

  async function handleGenerateVideo() {
    if (generating || videoGenerating || !id) {
      return;
    }
    if (videoScript.trim().length < 20) {
      return;
    }
    setVideoGenerating(true);
    setVideoJobId(null);
    setVideoJobStatus(null);
    setVideoJobResult(null);
    setActionMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/ai-influencers/${id}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: videoScript.trim(),
          aspect: videoAspect,
          duration: videoDuration,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Video generation failed (${res.status})`);
      }
      const data = await res.json();
      setVideoJobId(data.jobId);
      setVideoJobStatus(data.status);
      setActionMsg('Video pipeline queued. The chain takes 2-5 minutes.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setVideoGenerating(false);
    }
  }

  // Poll video job status while in progress
  useEffect(() => {
    if (!videoJobId || videoJobStatus === 'succeeded' || videoJobStatus === 'failed') {
      return;
    }

    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/ai-studio/jobs/${videoJobId}`, { cache: 'no-store' });
        if (!res.ok || cancelled) {
          return;
        }
        const data = await res.json();
        if (cancelled) {
          return;
        }
        setVideoJobStatus(data.job?.status || data.status);
        if (data.job?.output) {
          setVideoJobResult(data.job.output);
        }
        if (data.job?.status === 'succeeded' || data.job?.status === 'failed') {
          setVideoGenerating(false);
          if (data.job?.status === 'succeeded') {
            setActionMsg('Talking-head video generated.');
            load(); // refresh usage count
          }
        }
      } catch {
        // retry next tick
      }
    }
    const timer = setInterval(poll, 3000);
    poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [videoJobId, videoJobStatus, load]);

  async function loadAngles() {
    if (!id) {
      return;
    }
    try {
      const res = await fetch(`/api/ai-influencers/${id}/angles`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setAssignedAngles(data.angles || []);
      }
    } catch {
      // non-fatal
    }
  }

  async function loadAvailableAngles() {
    try {
      const res = await fetch('/api/content-angles', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const list = data.angles || data.items || [];
        setAvailableAngles(list);
      }
    } catch {
      setAvailableAngles([]);
    }
  }

  async function handleAssignAngle(angleId: string) {
    if (!id) {
      return;
    }
    const newIds = [...new Set([...assignedAngles.map(a => a.angleId), angleId])];
    try {
      const res = await fetch(`/api/ai-influencers/${id}/angles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ angleIds: newIds }),
      });
      if (res.ok) {
        await loadAngles();
      }
    } catch { /* non-fatal */ }
    setAngleSearchOpen(false);
    setAngleSearchQ('');
  }

  async function handleRemoveAngle(assignmentId: string) {
    if (!id) {
      return;
    }
    const newIds = assignedAngles.filter(a => a.assignmentId !== assignmentId).map(a => a.angleId);
    try {
      const res = await fetch(`/api/ai-influencers/${id}/angles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ angleIds: newIds }),
      });
      if (res.ok) {
        await loadAngles();
      }
    } catch { /* non-fatal */ }
  }

  async function handleGenerateScript() {
    if (scriptGenerating || !id) {
      return;
    }
    setScriptGenerating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        duration: videoDuration,
      };
      if (scriptTopic.trim()) {
        body.topic = scriptTopic.trim();
      }
      // Use the first assigned angle if any
      if (assignedAngles.length > 0) {
        body.angleId = assignedAngles[0]!.angleId;
      }

      const res = await fetch(`/api/ai-influencers/${id}/generate-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Script generation failed (${res.status})`);
      }
      const data = await res.json();
      if (data.script) {
        setVideoScript(data.script);
        setActionMsg('Script generated. Review and edit before generating video.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScriptGenerating(false);
    }
  }

  async function handleClone() {
    if (cloning || generating || !id) {
      return;
    }
    setCloning(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai-influencers/${id}/clone`, { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Clone failed (${res.status})`);
      }
      const data = await res.json();
      router.push(`/dashboard/influencers/${data.influencer.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCloning(false);
    }
  }

  async function handleBatchGenerate() {
    if (batchGenerating || scriptGenerating || !id) {
      return;
    }
    setBatchGenerating(true);
    setBatchScripts([]);
    setError(null);
    try {
      const body: Record<string, unknown> = { duration: videoDuration };
      if (scriptTopic.trim()) {
        body.topic = scriptTopic.trim();
      }
      const res = await fetch(`/api/ai-influencers/${id}/generate-scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Batch script generation failed (${res.status})`);
      }
      const data = await res.json();
      setBatchScripts(data.scripts || []);
      setActionMsg(`Generated ${data.scripts?.length || 0} scripts. Pick one to load into the video editor.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBatchGenerating(false);
    }
  }

  async function handleBatchGenerateVideos() {
    if (batchGenerating || scriptGenerating || videoGenerating || !id || batchScripts.length === 0) {
      return;
    }
    setBatchGenerating(true);
    setError(null);
    const newMap = new Map(batchVideoJobs);
    try {
      for (const s of batchScripts) {
        const res = await fetch(`/api/ai-influencers/${id}/generate-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: s.script, duration: videoDuration }),
        });
        if (!res.ok) {
          newMap.set(s.angleId, { jobId: '', status: 'failed' });
          continue;
        }
        const data = await res.json();
        newMap.set(s.angleId, { jobId: data.jobId, status: data.status || 'queued' });
        setBatchVideoJobs(new Map(newMap));
      }
      setActionMsg(`Queued ${newMap.size} video jobs. Monitor progress below.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBatchGenerating(false);
    }
  }

  async function handleDelete() {
    if (generating || !id) {
      return;
    }
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
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/influencers"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <ArrowLeft size={16} />
              Back
            </Link>
            <button
              type="button"
              onClick={handleClone}
              disabled={generating !== null || cloning}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {cloning ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
              {cloning ? 'Cloning…' : isSystem ? 'Clone to my org' : 'Duplicate'}
            </button>
          </div>
        )}
      />

      {error && <ErrorBanner title="Something went wrong" detail={error} onDismiss={() => setError(null)} />}
      {actionMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
          <CheckCircle2 size={14} />
          {actionMsg}
        </div>
      )}

      <TrainingBanner status={item.loraStatus} trainingMode={item.trainingMode} />

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Left: base image + reference grid — sticky on lg+ so long right panels don't push the identity out of view */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:col-span-2 lg:self-start">
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
                    <div className="flex size-full items-center justify-center text-muted-foreground">
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

          {clips.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">
                  Generated clips
                  {' '}
                  <span className="text-muted-foreground">
                    (
                    {clips.length}
                    )
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {clips.map(clip => (
                  <div key={clip.id} className="group relative aspect-square overflow-hidden rounded-md border border-border">
                    <video
                      src={clip.url}
                      poster={clip.thumbnailUrl || undefined}
                      muted
                      loop
                      preload="metadata"
                      className="size-full object-cover"
                      onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLVideoElement).pause(); (e.currentTarget as HTMLVideoElement).currentTime = 0;
                      }}
                    >
                      <track kind="captions" />
                    </video>
                    <div className="pointer-events-none absolute inset-0 flex items-end justify-end gap-1 bg-gradient-to-t from-black/60 via-transparent to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <a
                        href={clip.url}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="pointer-events-auto rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm hover:bg-black/80"
                        aria-label="Download clip"
                      >
                        <Sparkles size={12} />
                      </a>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(clip.url)}
                        className="pointer-events-auto rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm hover:bg-black/80"
                        aria-label="Copy clip link"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
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
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {currentVoice?.name || 'Voice unavailable'}
                          {currentVoice?.isClone && (
                            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] uppercase tracking-wide">Cloned</span>
                          )}
                        </div>
                        {currentVoice && (
                          <div className="mt-0.5 truncate text-xs capitalize text-muted-foreground">
                            {[currentVoice.gender, currentVoice.accent, currentVoice.vibe].filter(Boolean).join(' | ')}
                          </div>
                        )}
                      </div>
                      {currentVoice?.previewUrl && (
                        <button
                          type="button"
                          onClick={toggleVoicePreview}
                          className="shrink-0 rounded-full border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={voicePlaying ? 'Pause preview' : 'Play preview'}
                        >
                          {voicePlaying ? <Pause size={12} /> : <Play size={12} />}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                      <span className="truncate">{item.voiceId}</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(item.voiceId!)}
                        className="shrink-0 rounded p-1 hover:bg-muted"
                        aria-label="Copy voice ID"
                      >
                        <Copy size={10} />
                      </button>
                    </div>
                  </div>
                )
              : (
                  <div className="text-sm text-muted-foreground">No voice selected.</div>
                )}
          </section>

          {!isSystem && (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between text-sm font-medium">
                <span>Content angles</span>
                <button
                  type="button"
                  onClick={() => {
                    setAngleSearchOpen(!angleSearchOpen); if (!angleSearchOpen) {
                      setAngleSearchQ(''); loadAvailableAngles();
                    }
                  }}
                  disabled={generating !== null}
                  className="inline-flex items-center gap-1 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <Plus size={14} />
                </button>
              </div>
              {angleSearchOpen && (
                <div className="mb-2 space-y-1">
                  <input
                    type="text"
                    placeholder="Search angles..."
                    value={angleSearchQ}
                    onChange={e => setAngleSearchQ(e.target.value)}
                    className="w-full rounded-md border border-border bg-muted px-2 py-1 text-xs placeholder:text-muted-foreground"
                  />
                  <div className="max-h-32 overflow-y-auto rounded-md border border-border">
                    {availableAngles
                      .filter(a => !angleSearchQ || a.name.toLowerCase().includes(angleSearchQ.toLowerCase()))
                      .filter(a => !assignedAngles.some(aa => aa.angleId === a.id))
                      .length === 0
                      ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No angles found. Create angles in Campaigns.</div>
                      : availableAngles
                          .filter(a => !angleSearchQ || a.name.toLowerCase().includes(angleSearchQ.toLowerCase()))
                          .filter(a => !assignedAngles.some(aa => aa.angleId === a.id))
                          .map(a => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => handleAssignAngle(a.id)}
                              disabled={assignedAngles.some(aa => aa.angleId === a.id)}
                              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-40"
                            >
                              {a.color
                                ? <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                                : null}
                              <span className="truncate">{a.name}</span>
                            </button>
                          ))}
                  </div>
                </div>
              )}
              {assignedAngles.length === 0
                ? <div className="text-xs text-muted-foreground">No angles assigned. Assign angles to help script generation.</div>
                : (
                    <div className="flex flex-wrap gap-1">
                      {assignedAngles.map(a => (
                        <span key={a.assignmentId} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                          {a.color
                            ? <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                            : null}
                          <span className="max-w-[120px] truncate">{a.name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAngle(a.assignmentId)}
                            className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
            </section>
          )}

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Film size={14} />
              Generate Video
            </div>
            {item.loraStatus === 'ready' && item.voiceId
              ? (
                  <div className="space-y-3">
                    <textarea
                      placeholder="What should this influencer say? (min 20 chars)"
                      value={videoScript}
                      onChange={e => setVideoScript(e.target.value)}
                      rows={4}
                      maxLength={5000}
                      disabled={videoGenerating}
                      className="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-sm placeholder:text-muted-foreground disabled:opacity-50"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateScript}
                        disabled={scriptGenerating || videoGenerating || !item.personaPrompt}
                        title={!item.personaPrompt ? 'Set a persona prompt in the wizard first' : 'Generate a persona-aware script'}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                      >
                        {scriptGenerating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                        Generate script
                      </button>
                      <input
                        type="text"
                        placeholder="Optional topic"
                        value={scriptTopic}
                        onChange={e => setScriptTopic(e.target.value)}
                        disabled={scriptGenerating || videoGenerating}
                        className="w-32 rounded-md border border-border bg-muted px-2 py-1 text-xs placeholder:text-muted-foreground disabled:opacity-50"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={videoDuration}
                        onChange={e => setVideoDuration(Number(e.target.value))}
                        disabled={videoGenerating}
                        className="rounded-md border border-border bg-muted px-2 py-1 text-xs disabled:opacity-50"
                      >
                        <option value={5}>5s</option>
                        <option value={10}>10s</option>
                        <option value={15}>15s</option>
                      </select>
                      <div className="flex items-center gap-1">
                        {(['9:16', '1:1', '16:9'] as const).map(a => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => setVideoAspect(a)}
                            disabled={videoGenerating}
                            className={`rounded px-2 py-1 text-xs transition ${
                              videoAspect === a
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:text-foreground'
                            } disabled:opacity-50`}
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateVideo}
                      disabled={videoGenerating || videoScript.trim().length < 20 || generating !== null}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {videoGenerating && !videoJobId
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Play size={14} />}
                      {videoGenerating && !videoJobId ? 'Generating…' : `Generate talking-head video (${videoCredits} credits)`}
                    </button>
                    {videoJobId && (
                      <VideoJobStatusBanner
                        status={videoJobStatus}
                        result={videoJobResult}
                      />
                    )}
                  </div>
                )
              : (
                  <div className="text-sm text-muted-foreground">
                    {item.loraStatus !== 'ready'
                      ? 'Complete identity training first to enable video generation.'
                      : 'Assign a voice to enable video generation.'}
                  </div>
                )}
          </section>

          {!isSystem && assignedAngles.length >= 2 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Wand2 size={14} />
                Batch scripts
              </div>
              <button
                type="button"
                onClick={handleBatchGenerate}
                disabled={batchGenerating || scriptGenerating || videoGenerating}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                {batchGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {batchGenerating ? `Generating ${assignedAngles.length} scripts…` : `Generate ${assignedAngles.length} scripts`}
              </button>
              {batchScripts.length > 0 && (
                <>
                  <div className="mt-3 space-y-2">
                    {batchScripts.map(s => (
                      <button
                        key={s.angleId}
                        type="button"
                        onClick={() => {
                          setVideoScript(s.script); setActionMsg(`Loaded "${s.angleName}" script.`);
                        }}
                        className="w-full rounded-md border border-border p-2 text-left transition hover:bg-muted"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px]">{s.angleName}</span>
                          {batchVideoJobs.has(s.angleId) && (
                            <span className={batchVideoJobs.get(s.angleId)!.status === 'succeeded' ? 'text-emerald-500' : batchVideoJobs.get(s.angleId)!.status === 'failed' ? 'text-red-500' : 'text-amber-500'}>
                              {batchVideoJobs.get(s.angleId)!.status === 'succeeded' ? 'Done' : batchVideoJobs.get(s.angleId)!.status === 'failed' ? 'Failed' : 'Queued'}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{s.hookText}</div>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleBatchGenerateVideos}
                    disabled={batchGenerating || videoGenerating}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {batchGenerating ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}
                    {batchGenerating ? 'Queuing videos…' : `Generate ${batchScripts.length} videos`}
                  </button>
                </>
              )}
            </section>
          )}

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
                  {generating === 'image' ? 'Generating…' : 'Generate base image (3 credits)'}
                </button>

                <button
                  type="button"
                  onClick={handleTestConsistency}
                  disabled={generating !== null || item.loraStatus !== 'ready'}
                  title={item.loraStatus !== 'ready' ? 'Complete identity training first' : ''}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                >
                  {generating === 'consistency' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {generating === 'consistency' ? 'Testing…' : 'Test consistency (9 credits)'}
                </button>

                {(item.loraStatus === 'failed' || item.loraStatus === 'pending' || !item.loraStatus) && refs.length >= 1 && (
                  <div className="space-y-2">
                    {/* Mode selector */}
                    <div className="rounded-md border border-border bg-muted/30 p-2">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Training mode</div>
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${trainingMode === 'flux_lora' ? 'bg-card ring-1 ring-purple-500/40' : 'hover:bg-muted/50'}`}
                        title="Trains a custom face model for exact identity across every post. Best for high-volume creators. ~10 min setup. 250 credits."
                      >
                        <input
                          type="radio"
                          name="trainingMode"
                          value="flux_lora"
                          checked={trainingMode === 'flux_lora'}
                          onChange={() => setTrainingMode('flux_lora')}
                          className="sr-only"
                        />
                        <Zap size={12} className={trainingMode === 'flux_lora' ? 'text-purple-400' : 'text-muted-foreground'} />
                        <span className={trainingMode === 'flux_lora' ? 'font-medium' : ''}>Identity Lock</span>
                        <span className="text-muted-foreground">250 credits</span>
                      </label>
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${trainingMode === 'nano_banana' ? 'bg-card ring-1 ring-blue-500/40' : 'hover:bg-muted/50'}`}
                        title="Zero training. Uses Google Gemini 3 Pro for natural skin, realistic lighting. Ready instantly. 20 credits setup, 5 credits/image."
                      >
                        <input
                          type="radio"
                          name="trainingMode"
                          value="nano_banana"
                          checked={trainingMode === 'nano_banana'}
                          onChange={() => setTrainingMode('nano_banana')}
                          className="sr-only"
                        />
                        <Sparkles size={12} className={trainingMode === 'nano_banana' ? 'text-blue-400' : 'text-muted-foreground'} />
                        <span className={trainingMode === 'nano_banana' ? 'font-medium' : ''}>Instant Identity</span>
                        <span className="text-muted-foreground">20 credits</span>
                      </label>
                    </div>

                    {/* Action button */}
                    <button
                      type="button"
                      onClick={handleRetrain}
                      disabled={generating !== null || (trainingMode === 'flux_lora' && refs.length < 5)}
                      title={trainingMode === 'flux_lora' && refs.length < 5 ? 'Need at least 5 reference images for Identity Lock' : ''}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
                    >
                      {generating === 'retrain' ? <Loader2 size={14} className="animate-spin" /> : (trainingMode === 'nano_banana' ? <Sparkles size={14} /> : <Zap size={14} />)}
                      {item.loraStatus === 'failed'
                        ? 'Retry setup'
                        : trainingMode === 'nano_banana'
                          ? 'Setup Instant Identity (20 credits)'
                          : 'Start Training (250 credits)'}
                    </button>
                  </div>
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

          {!isSystem && analytics !== null && (
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 text-sm font-medium">Performance</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-semibold">{analytics.totalPosts}</div>
                  <div className="text-[11px] text-muted-foreground">Posts</div>
                </div>
                <div>
                  <div className="text-lg font-semibold">{analytics.totalEngagement.toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground">Engagement</div>
                </div>
                <div>
                  <div className="text-lg font-semibold">{analytics.topPlatform}</div>
                  <div className="text-[11px] text-muted-foreground">Top platform</div>
                </div>
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
  if (item.gender) {
    pairs.push(['Gender', item.gender]);
  }
  if (item.ageRange) {
    pairs.push(['Age', item.ageRange]);
  }
  if (item.ethnicity) {
    pairs.push(['Ethnicity', item.ethnicity]);
  }
  const hair = [item.hairColor, item.hairStyle].filter(Boolean).join(' ');
  if (hair) {
    pairs.push(['Hair', hair]);
  }
  if (item.bodyType) {
    pairs.push(['Body', item.bodyType]);
  }
  if (item.fashionStyle) {
    pairs.push(['Fashion', item.fashionStyle]);
  }
  if (item.poseStyle) {
    pairs.push(['Pose', item.poseStyle]);
  }
  if (item.backgroundPreference) {
    pairs.push(['Background', item.backgroundPreference]);
  }
  if (item.archetype) {
    pairs.push(['Archetype', item.archetype]);
  }
  return pairs;
}

function TrainingBanner({ status, trainingMode: tm }: { status: string | null; trainingMode?: string | null }) {
  const modeLabel = tm === 'nano_banana' ? 'Instant Identity' : 'Identity Lock';
  if (!status || status === 'pending') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <Sparkles size={14} />
        Identity not set up yet. Add reference photos and select a training mode below.
      </div>
    );
  }
  if (status === 'training') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
        <Loader2 size={14} className="animate-spin" />
        Training in progress (Identity Lock). This typically takes 3-10 minutes. You can leave this page.
      </div>
    );
  }
  if (status === 'ready') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={14} />
        Identity ready (
        {modeLabel}
        ).
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <XCircle size={14} />
        Identity setup failed. Retry with different reference photos.
      </div>
    );
  }
  return null;
}

function VideoJobStatusBanner({
  status,
  result,
}: {
  status: string | null;
  result: { url?: string; thumbnailUrl?: string } | null;
}) {
  if (!status || status === 'succeeded' || status === 'failed' || status === 'canceled') {
    if (status === 'succeeded' && result?.url) {
      // Cloudinary video URL → derive a jpg poster from it
      const posterUrl = result.thumbnailUrl || result.url?.replace(/\.mp4\w*(\?.*)?$/, '.jpg');
      return (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2">
          <div className="mb-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={12} />
            Video ready
          </div>
          <video
            src={result.url}
            poster={posterUrl}
            controls
            preload="metadata"
            className="w-full rounded object-cover"
            style={{ maxHeight: 360 }}
          >
            <track kind="captions" />
          </video>
        </div>
      );
    }
    if (status === 'succeeded') {
      return (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={12} />
          Video generated successfully.
        </div>
      );
    }
    if (status === 'failed') {
      return (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <XCircle size={12} />
          Video generation failed.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
      <Loader2 size={12} className="animate-spin" />
      {status === 'queued' && 'Queued…'}
      {status === 'reserved' && 'Reserving…'}
      {status === 'processing' && 'Generating video…'}
      {(status === 'IN_QUEUE' || status === 'IN_PROGRESS') && 'Rendering on fal.ai…'}
    </div>
  );
}

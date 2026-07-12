'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AiCreditWallet } from '@/lib/ai-studio/server';
import {
  AI_STUDIO_MODELS,
  estimateCredits,
  getModel,
  type AiStudioKind,
  type AiStudioTemplate,
} from '@/lib/ai-studio/models';

import type { AspectRatio } from './AspectRatioPicker';
import { CreditBadge } from './CreditBadge';
import { InsufficientCreditsAlert } from './InsufficientCreditsAlert';
import type { AiStudioJobView } from './JobCard';
import { JobGrid } from './JobGrid';
import { KindTabs } from './KindTabs';
import { PromptComposer } from './PromptComposer';
import { TalkingHeadComposer } from './TalkingHeadComposer';
import { TemplatePresets } from './TemplatePresets';

const DEFAULT_MODEL_BY_KIND: Record<AiStudioKind, string> = {
  'image': 'flux-dev',
  'image-edit': 'gpt-image-2-edit',
  'video': 'pixverse-v6-i2v',
  'video-lipsync': 'veed-lipsync',
};

interface InsufficientState {
  required: number;
  available: number;
}

function spendable(wallet: AiCreditWallet | null): number {
  if (!wallet) return 0;
  const monthly = Math.max(0, wallet.monthly.limit - wallet.monthly.used);
  const addon = wallet.addon.remaining ?? 0;
  const reserved = wallet.reservedCredits ?? 0;
  return Math.max(0, monthly + addon - reserved);
}

export function AIStudioClient() {
  const [kind, setKind] = useState<AiStudioKind>('image');
  const [modelId, setModelId] = useState<string>('flux-dev');
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [duration, setDuration] = useState(5);
  const [references, setReferences] = useState<string[]>([]);

  const [jobs, setJobs] = useState<AiStudioJobView[]>([]);
  const [wallet, setWallet] = useState<AiCreditWallet | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [insufficient, setInsufficient] = useState<InsufficientState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset model + references + duration when the kind tab flips so we never
  // send a model that mismatches the current kind.
  useEffect(() => {
    const next = DEFAULT_MODEL_BY_KIND[kind];
    setModelId(next);
    setReferences([]);
    const nextModel = getModel(next);
    if (nextModel?.durations?.length) {
      setDuration(nextModel.durations[0]!);
    }
    if (nextModel && !nextModel.aspects.includes(aspect)) {
      setAspect(nextModel.aspects[0] as AspectRatio);
    }
  }, [kind]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai-studio/jobs?limit=50`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch {
      // ignore transient failures; next tick retries
    }
  }, []);

  const fetchWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-studio/credits', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setWallet(data.wallet);
    } catch {
      // ignore
    }
  }, []);

  // Initial load + adaptive polling. Poll fast (3s) while any job is in
  // flight, slow (15s) when everything is settled.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await Promise.all([fetchJobs(), fetchWallet()]);
      const anyInFlight = jobs.some(j =>
        ['reserved', 'queued', 'processing'].includes(j.status),
      );
      const delay = anyInFlight ? 3000 : 15000;
      pollRef.current = setTimeout(tick, delay);
    };
    tick();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // We intentionally re-run this effect when the in-flight-ness of the job
    // list changes so the interval retunes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchJobs, fetchWallet, jobs.some(j => ['reserved', 'queued', 'processing'].includes(j.status))]);

  const currentModel = getModel(modelId);
  const requiredCredits = useMemo(() => {
    if (!currentModel) return 0;
    return estimateCredits(currentModel, { seconds: duration });
  }, [currentModel, duration]);

  const filteredJobs = useMemo(() => {
    if (kind === 'video-lipsync') {
      return jobs.filter(j => j.kind === 'video-lipsync' || j.kind === 'video');
    }
    return jobs.filter(j => j.kind === kind);
  }, [jobs, kind]);

  const submitStandard = useCallback(async () => {
    if (!currentModel) return;
    setInsufficient(null);
    setErrorMessage(null);

    const available = spendable(wallet);
    if (requiredCredits > available) {
      setInsufficient({ required: requiredCredits, available });
      return;
    }

    setSubmitting(true);
    try {
      let endpoint = '/api/ai-studio/image';
      let payload: Record<string, unknown> = {
        modelId,
        prompt: prompt.trim(),
        aspect,
      };

      if (kind === 'image-edit') {
        endpoint = '/api/ai-studio/image/edit';
        payload = {
          modelId,
          prompt: prompt.trim(),
          aspect,
          referenceImageUrl: references[0],
        };
      } else if (kind === 'video') {
        endpoint = '/api/ai-studio/video';
        payload = {
          modelId,
          prompt: prompt.trim(),
          aspect,
          duration,
          imageUrl: references[0],
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 402) {
        const body = await res.json().catch(() => ({} as any));
        setInsufficient({
          required: Number(body.required ?? requiredCredits),
          available: Number(body.available ?? available),
        });
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        setErrorMessage(body.error ?? 'Failed to start generation');
        return;
      }

      setPrompt('');
      setReferences([]);
      await Promise.all([fetchJobs(), fetchWallet()]);
    } finally {
      setSubmitting(false);
    }
  }, [currentModel, wallet, requiredCredits, modelId, prompt, aspect, kind, duration, references, fetchJobs, fetchWallet]);

  const submitLipsync = useCallback(
    async (payload: {
      prompt: string;
      imageUrl: string;
      audioUrl: string;
      i2vModelId: string;
      aspect: AspectRatio;
      duration: number;
    }) => {
      setInsufficient(null);
      setErrorMessage(null);

      const i2v = getModel(payload.i2vModelId);
      const lip = getModel('veed-lipsync');
      const needed = (i2v?.credits ?? 0) + (lip?.credits ?? 0);
      const available = spendable(wallet);
      if (needed > available) {
        setInsufficient({ required: needed, available });
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch('/api/ai-studio/video/lipsync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.status === 402) {
          const body = await res.json().catch(() => ({} as any));
          setInsufficient({
            required: Number(body.required ?? needed),
            available: Number(body.available ?? available),
          });
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as any));
          setErrorMessage(body.error ?? 'Failed to start Talking Head job');
          return;
        }

        await Promise.all([fetchJobs(), fetchWallet()]);
      } finally {
        setSubmitting(false);
      }
    },
    [wallet, fetchJobs, fetchWallet],
  );

  const handleTemplateSelect = useCallback(
    (template: AiStudioTemplate) => {
      setPrompt(template.prompt);
      setModelId(template.defaultModelId);
      setAspect(template.defaultAspect);
      const model = AI_STUDIO_MODELS.find(m => m.id === template.defaultModelId);
      if (model?.durations?.length) {
        setDuration(model.durations[0]!);
      }
    },
    [],
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">AI Studio</h1>
          <p className="text-sm text-muted-foreground">
            Generate images, video, and Talking Head clips. Every asset syncs to your Media Library.
          </p>
        </div>
        <CreditBadge wallet={wallet} onWallet={setWallet} />
      </header>

      <section className="flex flex-col gap-3">
        <KindTabs value={kind} onChange={setKind} />
        <TemplatePresets kind={kind} onSelect={handleTemplateSelect} />
      </section>

      {insufficient && (
        <InsufficientCreditsAlert
          required={insufficient.required}
          available={insufficient.available}
          onDismiss={() => setInsufficient(null)}
        />
      )}

      {errorMessage && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <section className="flex-1">
        <JobGrid jobs={filteredJobs} onCanceled={fetchJobs} />
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {kind === 'video-lipsync' ? (
          <TalkingHeadComposer onSubmit={submitLipsync} submitting={submitting} />
        ) : (
          <PromptComposer
            kind={kind}
            modelId={modelId}
            onModelChange={setModelId}
            prompt={prompt}
            onPromptChange={setPrompt}
            aspect={aspect}
            onAspectChange={setAspect}
            duration={duration}
            onDurationChange={setDuration}
            references={references}
            onReferencesChange={setReferences}
            onSubmit={submitStandard}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  );
}

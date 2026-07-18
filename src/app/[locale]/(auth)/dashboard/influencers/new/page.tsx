'use client';

import { ArrowLeft, ArrowRight, CheckCircle2, Clock, ImagePlus, Loader2, Mic, Pause, Play, RefreshCw, Sparkles, Upload, UserRound, Wand2, X, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CldImage, CldUploadWidget, type CloudinaryUploadWidgetOptions } from 'next-cloudinary';
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '';

// ── Curated trait options ──────────────────────────────────
const GENDERS = ['female', 'male', 'non-binary'];
const AGE_RANGES = ['18-24', '25-34', '35-44', '45-54', '55+'];
const ETHNICITIES = ['east asian', 'south asian', 'black', 'white', 'hispanic', 'middle eastern', 'mixed'];
const HAIR_STYLES = ['short', 'medium', 'long', 'curly', 'wavy', 'straight', 'buzz cut', 'braids'];
const HAIR_COLORS = ['black', 'brown', 'blonde', 'red', 'gray', 'dyed'];
const BODY_TYPES = ['slim', 'athletic', 'average', 'muscular', 'curvy'];
const FASHION_STYLES = ['professional', 'casual', 'streetwear', 'gym', 'formal', 'trendy', 'minimalist'];
const POSE_STYLES = ['portrait', 'confident', 'candid', 'action', 'seated'];
const BACKGROUND_PREFS = ['studio', 'office', 'outdoor', 'cafe', 'urban', 'gym', 'home'];
const ARCHETYPES = ['journey', 'theme', 'spinoff'];

// Voices loaded dynamically from /api/ai-influencers/voices (see VoiceStep).
type Voice = {
  id: string;
  name: string;
  gender: string | null;
  accent: string | null;
  vibe: string | null;
  previewUrl: string | null;
  isClone: boolean;
};

const MIN_REFERENCES = 5;
const MAX_REFERENCES = 10;

type Traits = {
  name: string;
  description: string;
  gender: string;
  ageRange: string;
  ethnicity: string;
  hairStyle: string;
  hairColor: string;
  bodyType: string;
  fashionStyle: string;
  poseStyle: string;
  backgroundPreference: string;
  archetype: string;
};

const EMPTY_TRAITS: Traits = {
  name: '',
  description: '',
  gender: '',
  ageRange: '',
  ethnicity: '',
  hairStyle: '',
  hairColor: '',
  bodyType: '',
  fashionStyle: '',
  poseStyle: '',
  backgroundPreference: '',
  archetype: '',
};

type Step = 'traits' | 'references' | 'basePreview' | 'voice' | 'persona' | 'review';
const STEPS: Step[] = ['traits', 'references', 'basePreview', 'voice', 'persona', 'review'];

export default function NewInfluencerPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('traits');
  const [traits, setTraits] = useState<Traits>(EMPTY_TRAITS);
  const [references, setReferences] = useState<string[]>([]);
  const [voiceId, setVoiceId] = useState<string>('');
  const [personaPrompt, setPersonaPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [regenInstructions, setRegenInstructions] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [trainingMode, setTrainingMode] = useState<'flux_lora' | 'nano_banana'>('flux_lora');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [cloneEnabled, setCloneEnabled] = useState(false);

  const loadVoices = useCallback(async () => {
    setVoicesLoading(true);
    try {
      const res = await fetch('/api/ai-influencers/voices', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setVoices(data.voices || []);
      }
    } catch {
      // non-fatal
    } finally {
      setVoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVoices();
    fetch('/api/ai-influencers/voice-clone', { cache: 'no-store' })
      .then(r => setCloneEnabled(r.ok))
      .catch(() => setCloneEnabled(false));
  }, [loadVoices]);

  const stepIndex = STEPS.indexOf(step);
  const canNext = stepGuard(step, traits, references, voiceId, personaPrompt, previewUrl);

  function goNext() {
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1]!);
    }
  }
  function goBack() {
    if (stepIndex > 0) {
      setStep(STEPS[stepIndex - 1]!);
    }
  }

  const generatePreview = useCallback(async (regen?: string) => {
    if (previewLoading) {
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch('/api/ai-influencers/preview-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traits,
          regenerationInstructions: regen?.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Preview failed (${res.status})`);
      }
      const data = await res.json();
      if (!data.imageUrl) {
        throw new Error('Engine returned no image');
      }
      setPreviewUrl(data.imageUrl);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
  }, [previewLoading, traits]);

  async function handleSubmit() {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // 1. Create influencer row
      const createRes = await fetch('/api/ai-influencers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...traits,
          referenceImageUrls: references,
          baseImageUrl: previewUrl,
          voiceId,
          personaPrompt,
        }),
      });
      if (!createRes.ok) {
        const detail = await createRes.json().catch(() => ({}));
        throw new Error(detail.error || `Create failed (${createRes.status})`);
      }
      const created = await createRes.json();
      const id = created.item?.id;
      if (!id) {
        throw new Error('Server did not return influencer id');
      }

      // 2. Kick off identity training
      const trainRes = await fetch(`/api/ai-influencers/${id}/train-lora`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingMode }),
      });
      if (!trainRes.ok) {
        const trainErr = await trainRes.json().catch(() => ({}));
        if (trainRes.status === 402) {
          throw new Error('Insufficient AI credits. Please add credits and try again.');
        }
        throw new Error(trainErr.error || `Training kickoff failed (${trainRes.status})`);
      }

      // 3. Redirect to detail
      router.push(`/dashboard/influencers/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New Influencer"
        description="Create a face-locked AI creator that appears consistently across every post."
        actions={(
          <Link
            href="/dashboard/influencers"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </Link>
        )}
      />

      {error && <ErrorBanner title="Something went wrong" detail={error} onDismiss={() => setError(null)} />}

      <StepIndicator step={step} />

      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        {step === 'traits' && <TraitsStep traits={traits} setTraits={setTraits} />}
        {step === 'references' && (
          <ReferencesStep references={references} setReferences={setReferences} />
        )}
        {step === 'basePreview' && (
          <BasePreviewStep
            previewUrl={previewUrl}
            regenInstructions={regenInstructions}
            setRegenInstructions={setRegenInstructions}
            previewLoading={previewLoading}
            previewError={previewError}
            generatePreview={generatePreview}
          />
        )}
        {step === 'voice' && (
          <VoiceStep
            voiceId={voiceId}
            setVoiceId={setVoiceId}
            voices={voices}
            voicesLoading={voicesLoading}
            cloneEnabled={cloneEnabled}
            onVoicesRefresh={loadVoices}
          />
        )}
        {step === 'persona' && (
          <PersonaStep personaPrompt={personaPrompt} setPersonaPrompt={setPersonaPrompt} />
        )}
        {step === 'review' && (
          <ReviewStep
            traits={traits}
            references={references}
            voiceId={voiceId}
            voices={voices}
            personaPrompt={personaPrompt}
            previewUrl={previewUrl}
            trainingMode={trainingMode}
            setTrainingMode={setTrainingMode}
          />
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={stepIndex === 0 || submitting}
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        {stepIndex < STEPS.length - 1
          ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canNext || submitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Continue
                <ArrowRight size={16} />
              </button>
            )
          : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canNext || submitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {submitting
                  ? 'Creating…'
                  : trainingMode === 'nano_banana'
                    ? 'Create & Setup Identity (20 credits)'
                    : 'Create & Start Training (250 credits)'}
              </button>
            )}
      </div>
    </>
  );
}

function stepGuard(step: Step, traits: Traits, references: string[], voiceId: string, personaPrompt: string, previewUrl: string | null): boolean {
  if (step === 'traits') {
    return traits.name.trim().length > 0 && traits.gender.length > 0 && traits.ageRange.length > 0;
  }
  if (step === 'references') {
    return references.length >= MIN_REFERENCES;
  }
  if (step === 'basePreview') {
    return previewUrl !== null;
  }
  if (step === 'voice') {
    return voiceId.length > 0;
  }
  if (step === 'persona') {
    return personaPrompt.trim().length > 20;
  }
  if (step === 'review') {
    return previewUrl !== null && voiceId.length > 0 && personaPrompt.trim().length > 20;
  }
  return false;
}

function StepIndicator({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step);
  const labels: Record<Step, string> = {
    traits: 'Traits',
    references: 'References',
    basePreview: 'Preview',
    voice: 'Voice',
    persona: 'Persona',
    review: 'Review',
  };
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((s, i) => (
        <div key={s} className="flex flex-1 items-center gap-2">
          <div
            className={`flex size-6 items-center justify-center rounded-full text-xs font-medium ${
              i <= idx
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-sm ${i === idx ? 'font-medium' : 'text-muted-foreground'}`}>
            {labels[s]}
          </span>
          {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Traits ─────────────────────────────────────────
function TraitsStep({ traits, setTraits }: { traits: Traits; setTraits: (t: Traits) => void }) {
  function set<K extends keyof Traits>(key: K, value: Traits[K]) {
    setTraits({ ...traits, [key]: value });
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="influencer-name">
          Name
          <span className="text-destructive"> *</span>
        </label>
        <input
          id="influencer-name"
          type="text"
          value={traits.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Sarah, Jake, Maya"
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="influencer-description">Short bio (optional)</label>
        <textarea
          id="influencer-description"
          value={traits.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Fitness coach who posts morning routines and gym tips…"
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <TraitPicker label="Gender" options={GENDERS} value={traits.gender} onChange={v => set('gender', v)} required />
      <TraitPicker label="Age" options={AGE_RANGES} value={traits.ageRange} onChange={v => set('ageRange', v)} required />
      <TraitPicker label="Ethnicity" options={ETHNICITIES} value={traits.ethnicity} onChange={v => set('ethnicity', v)} />
      <div className="grid grid-cols-2 gap-6">
        <TraitPicker label="Hair style" options={HAIR_STYLES} value={traits.hairStyle} onChange={v => set('hairStyle', v)} />
        <TraitPicker label="Hair color" options={HAIR_COLORS} value={traits.hairColor} onChange={v => set('hairColor', v)} />
      </div>
      <TraitPicker label="Body type" options={BODY_TYPES} value={traits.bodyType} onChange={v => set('bodyType', v)} />
      <TraitPicker label="Fashion style" options={FASHION_STYLES} value={traits.fashionStyle} onChange={v => set('fashionStyle', v)} />
      <TraitPicker label="Pose style" options={POSE_STYLES} value={traits.poseStyle} onChange={v => set('poseStyle', v)} />
      <TraitPicker label="Background preference" options={BACKGROUND_PREFS} value={traits.backgroundPreference} onChange={v => set('backgroundPreference', v)} />
      <TraitPicker label="Content archetype" options={ARCHETYPES} value={traits.archetype} onChange={v => set('archetype', v)} />
    </div>
  );
}

function TraitPicker({
  label,
  options,
  value,
  onChange,
  required,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? '' : opt)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
              value === opt
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-muted'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: References ─────────────────────────────────────
function ReferencesStep({
  references,
  setReferences,
}: {
  references: string[];
  setReferences: Dispatch<SetStateAction<string[]>>;
}) {
  const widgetOptions: CloudinaryUploadWidgetOptions = {
    sources: ['local', 'url', 'camera'],
    multiple: true,
    resourceType: 'image',
    clientAllowedFormats: ['png', 'jpg', 'jpeg', 'webp'],
    maxFileSize: 8_000_000,
    maxFiles: MAX_REFERENCES - references.length,
    cropping: false,
  };

  function removeAt(idx: number) {
    setReferences(prev => prev.filter((_, i) => i !== idx));
  }

  function buildDelivery(publicId: string): string {
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/q_auto,f_auto/${publicId}`;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium">Reference photos</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload
          {' '}
          {MIN_REFERENCES}
          -
          {MAX_REFERENCES}
          {' '}
          clear photos of the same face. Different angles, expressions, and lighting help
          helps lock the identity across generations.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {references.map((url, i) => {
          const publicId = url.match(/\/upload\/(?:[^/]+\/)*([^./]+(?:\/[^./]+)*)(?:\.[a-z0-9]+)?$/i)?.[1];
          return (
            <div key={url} className="relative aspect-square overflow-hidden rounded-md border border-border">
              {publicId
                ? <CldImage src={publicId} alt={`Reference ${i + 1}`} width={200} height={200} className="size-full object-cover" />
                : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={`Reference ${i + 1}`} className="size-full object-cover" />
                  )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                aria-label={`Remove reference ${i + 1}`}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        {references.length < MAX_REFERENCES && (
          <CldUploadWidget
            signatureEndpoint="/api/media-library/signature"
            options={widgetOptions}
            onSuccess={(result) => {
              const info: any = (result as any)?.info;
              if (!info?.public_id) {
                return;
              }
              const url = buildDelivery(info.public_id);
              // Avoid duplicates — CldUploadWidget fires per-file, so we merge in order.
              setReferences(prev => (prev.includes(url) ? prev : [...prev, url]));
            }}
          >
            {({ open }) => (
              <button
                type="button"
                onClick={() => open()}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
              >
                <ImagePlus size={20} />
                <span className="text-xs">Add photos</span>
              </button>
            )}
          </CldUploadWidget>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        {references.length}
        /
        {MAX_REFERENCES}
        {' '}
        uploaded (
        {MIN_REFERENCES}
        {' '}
        minimum)
      </div>
    </div>
  );
}

// ── Step 3: Voice ──────────────────────────────────────────
function VoiceStep({
  voiceId,
  setVoiceId,
  voices,
  voicesLoading,
  cloneEnabled,
  onVoicesRefresh,
}: {
  voiceId: string;
  setVoiceId: (v: string) => void;
  voices: Voice[];
  voicesLoading: boolean;
  cloneEnabled: boolean;
  onVoicesRefresh: () => Promise<void>;
}) {
  const [voiceTab, setVoiceTab] = useState<'stock' | 'clones'>('stock');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stockVoices = voices.filter(v => !v.isClone);
  const clonedVoices = voices.filter(v => v.isClone);

  function togglePlay(v: Voice) {
    if (!v.previewUrl) {
      return;
    }
    if (playingId === v.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const a = new Audio(v.previewUrl);
    audioRef.current = a;
    a.onended = () => setPlayingId(null);
    a.onerror = () => setPlayingId(null);
    a.play().then(() => setPlayingId(v.id)).catch(() => setPlayingId(null));
  }

  const activeList = voiceTab === 'stock' ? stockVoices : clonedVoices;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mic size={16} />
          Pick a voice
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          This becomes the voice-over for every talking-head video generated from this influencer.
          {' '}
          Click Play to hear a sample.
        </p>
      </div>

      {cloneEnabled && (
        <div className="flex items-center gap-2 border-b border-border">
          <VoiceTabButton active={voiceTab === 'stock'} onClick={() => setVoiceTab('stock')} label={`Stock voices (${stockVoices.length})`} />
          <VoiceTabButton active={voiceTab === 'clones'} onClick={() => setVoiceTab('clones')} label={`Your voices (${clonedVoices.length})`} />
        </div>
      )}

      {voiceTab === 'clones' && cloneEnabled && (
        <CloneUploader onCloned={async () => { await onVoicesRefresh(); }} />
      )}

      {voicesLoading
        ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Loading voices
            </div>
          )
        : activeList.length === 0
          ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {voiceTab === 'clones'
                  ? 'No cloned voices yet. Upload a 30 second to 3 minute audio sample above.'
                  : 'No voices available.'}
              </div>
            )
          : (
              <div className="grid gap-2 sm:grid-cols-2">
                {activeList.map(v => (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between rounded-md border p-3 text-left text-sm transition ${
                      voiceId === v.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setVoiceId(v.id)}
                      className="flex-1 text-left"
                    >
                      <div className="font-medium">{v.name}</div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {[v.gender, v.accent, v.vibe].filter(Boolean).join(' | ')}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      {v.previewUrl && (
                        <button
                          type="button"
                          onClick={() => togglePlay(v)}
                          className="rounded-full border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={playingId === v.id ? 'Pause preview' : 'Play preview'}
                        >
                          {playingId === v.id ? <Pause size={12} /> : <Play size={12} />}
                        </button>
                      )}
                      {voiceId === v.id && (
                        <CheckCircle2 size={16} className="text-primary" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
    </div>
  );
}

function VoiceTabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function CloneUploader({ onCloned }: { onCloned: () => Promise<void> }) {
  const [audioUrl, setAudioUrl] = useState('');
  const [name, setName] = useState('');
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const widgetOptions: CloudinaryUploadWidgetOptions = {
    sources: ['local'],
    multiple: false,
    resourceType: 'video', // Cloudinary treats audio as video
    clientAllowedFormats: ['mp3', 'wav', 'm4a', 'ogg', 'webm'],
    maxFileSize: 25_000_000,
  };

  async function submit() {
    if (!name.trim() || !audioUrl || !consented || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-influencers/voice-clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), audioUrl, consented: true }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `Clone failed (${res.status})`);
      }
      setName('');
      setAudioUrl('');
      setConsented(false);
      await onCloned();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <Upload size={14} />
        Clone a voice
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Upload a clear 30 second to 3 minute audio sample. Best results with a single speaker, no background music.
      </p>
      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Voice name (e.g. Sarah v2)"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
        />
        <div className="flex items-center gap-2">
          <CldUploadWidget
            signatureEndpoint="/api/media-library/signature"
            options={widgetOptions}
            onSuccess={(result) => {
              const info: any = (result as any)?.info;
              if (info?.secure_url) {
                setAudioUrl(info.secure_url);
              }
            }}
          >
            {({ open }) => (
              <button
                type="button"
                onClick={() => open()}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-muted"
              >
                <Upload size={12} />
                {audioUrl ? 'Replace audio' : 'Upload audio'}
              </button>
            )}
          </CldUploadWidget>
          {audioUrl && (
            <span className="truncate text-xs text-muted-foreground">Sample uploaded</span>
          )}
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={consented}
            onChange={e => setConsented(e.target.checked)}
            className="mt-0.5"
          />
          <span>I confirm I have the right to use this voice sample and to create an AI clone of it.</span>
        </label>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || !audioUrl || !consented || submitting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {submitting ? 'Cloning' : 'Clone voice'}
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Persona ────────────────────────────────────────
function PersonaStep({
  personaPrompt,
  setPersonaPrompt,
}: {
  personaPrompt: string;
  setPersonaPrompt: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserRound size={16} />
          Persona prompt
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe how this influencer talks and what they care about. The script LLM uses
          this as the system prompt so every caption sounds like the same person.
        </p>
      </div>

      <textarea
        value={personaPrompt}
        onChange={e => setPersonaPrompt(e.target.value)}
        placeholder="Sarah is a 27-year-old fitness coach in Austin. She posts short, punchy morning routine advice — no fluff, no hype. She writes at a 6th-grade reading level, uses lowercase captions, and never uses hashtags in the hook line."
        rows={8}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />

      <div className="text-xs text-muted-foreground">
        {personaPrompt.trim().length}
        {' '}
        characters (20 minimum)
      </div>
    </div>
  );
}

// ── Step: Base Character Preview ───────────────────────────
function BasePreviewStep({
  previewUrl,
  regenInstructions,
  setRegenInstructions,
  previewLoading,
  previewError,
  generatePreview,
}: {
  previewUrl: string | null;
  regenInstructions: string;
  setRegenInstructions: (v: string) => void;
  previewLoading: boolean;
  previewError: string | null;
  generatePreview: (regen?: string) => Promise<void>;
}) {
  // Auto-fire the first candidate when the user lands on this step.
  useEffect(() => {
    if (previewUrl === null && !previewLoading && previewError === null) {
      void generatePreview();
    }
    // Only run on mount — subsequent regens go through the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wand2 size={16} />
          Base character preview
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          We're generating a candidate face from your traits. Don't like it? Add
          instructions below and hit Regenerate to try a different look. Regenerations
          produce a brand-new person, not edits to this one.
        </p>
      </div>

      <div className="mx-auto flex aspect-[9/16] max-w-xs items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {previewLoading
          ? <Loader2 size={32} className="animate-spin text-muted-foreground" />
          : previewError
            ? (
                <div className="p-4 text-center text-sm text-destructive">
                  {previewError}
                </div>
              )
            : previewUrl
              ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Base character preview"
                    className="size-full object-cover"
                  />
                )
              : <span className="text-sm text-muted-foreground">Preparing…</span>}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="regen-instructions">
          Regeneration instructions (optional)
        </label>
        <textarea
          id="regen-instructions"
          value={regenInstructions}
          onChange={e => setRegenInstructions(e.target.value)}
          placeholder="e.g. curlier hair, softer features, in a coffee shop"
          rows={2}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          ~3 credits per regeneration
        </p>
        <button
          type="button"
          onClick={() => generatePreview(regenInstructions)}
          disabled={previewLoading}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          {previewLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {previewLoading ? 'Generating…' : 'Regenerate'}
        </button>
      </div>
    </div>
  );
}

// ── Step: Review & Create ──────────────────────────────────
function ReviewStep({
  traits,
  references,
  voiceId,
  voices,
  personaPrompt,
  previewUrl,
  trainingMode,
  setTrainingMode,
}: {
  traits: Traits;
  references: string[];
  voiceId: string;
  voices: Voice[];
  personaPrompt: string;
  previewUrl: string | null;
  trainingMode: 'flux_lora' | 'nano_banana';
  setTrainingMode: (mode: 'flux_lora' | 'nano_banana') => void;
}) {
  const voice = voices.find(v => v.id === voiceId);
  const traitSummary = [
    traits.gender,
    traits.ageRange,
    traits.ethnicity,
    traits.hairColor && traits.hairStyle ? `${traits.hairColor} ${traits.hairStyle} hair` : traits.hairStyle || traits.hairColor,
    traits.bodyType,
    traits.fashionStyle,
  ].filter(Boolean).join(' · ');

  const personaPreview = personaPrompt.length > 120
    ? `${personaPrompt.slice(0, 120)}…`
    : personaPrompt;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles size={16} />
          Review &amp; create
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Our agents will train the identity model for
          {' '}
          <span className="font-medium text-foreground">{traits.name || 'this influencer'}</span>
          {' '}
          now. Check the summary below before you commit.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_1fr]">
        <div className="mx-auto aspect-[9/16] w-full max-w-[200px] overflow-hidden rounded-lg border border-border bg-muted">
          {previewUrl
            ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Base character" className="size-full object-cover" />
              )
            : (
                <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                  No preview
                </div>
              )}
        </div>

        <dl className="space-y-3 text-sm">
          <SummaryRow label="Name" value={traits.name || '—'} />
          <SummaryRow label="Traits" value={traitSummary || '—'} />
          <SummaryRow label="References" value={`${references.length} photo${references.length === 1 ? '' : 's'} uploaded`} />
          <SummaryRow label="Voice" value={voice ? `${voice.name} · ${voice.accent} · ${voice.vibe}` : '—'} />
          <SummaryRow label="Persona" value={personaPreview || '—'} />
        </dl>

        {/* Training mode selector */}
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Select training mode</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTrainingMode('flux_lora')}
              className={`rounded-md border p-2 text-left text-xs transition-colors ${trainingMode === 'flux_lora' ? 'border-purple-500/40 bg-purple-500/10 ring-1 ring-purple-500/30' : 'border-border hover:bg-muted/50'}`}
              title="Trains a custom face model for exact identity across every post. Best for high-volume creators."
            >
              <div className="mb-1 flex items-center gap-1 font-medium">
                <Zap size={12} className="text-purple-400" />
                Identity Lock
              </div>
              <div className="text-muted-foreground">Exact face consistency. ~10 min setup. 250 credits.</div>
            </button>
            <button
              type="button"
              onClick={() => setTrainingMode('nano_banana')}
              className={`rounded-md border p-2 text-left text-xs transition-colors ${trainingMode === 'nano_banana' ? 'border-blue-500/40 bg-blue-500/10 ring-1 ring-blue-500/30' : 'border-border hover:bg-muted/50'}`}
              title="Zero training. Uses Google Gemini 3 Pro for natural skin, realistic lighting. Ready instantly."
            >
              <div className="mb-1 flex items-center gap-1 font-medium">
                <Sparkles size={12} className="text-blue-400" />
                Instant Identity
              </div>
              <div className="text-muted-foreground">Natural look, instant setup. 20 credits.</div>
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
        <div className="mb-2 flex items-center gap-2 font-medium">
          <Clock size={14} />
          What happens after you click Create
        </div>
        <ul className="space-y-1 text-muted-foreground">
          {trainingMode === 'flux_lora' ? (
            <>
              <li>Training takes about 3–10 minutes.</li>
              <li>Estimated cost: ~360 credits (250 identity training + 110 talking-head video).</li>
              <li>You can start using this influencer as soon as training finishes — we'll show progress on the detail page.</li>
            </>
          ) : (
            <>
              <li>Identity is ready instantly — no training wait.</li>
              <li>Estimated cost: ~130 credits (20 setup + 110 talking-head video).</li>
              <li>Each image generation costs 5 credits and uses your reference photos for identity.</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="min-w-[92px] text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="flex-1 capitalize">{value}</dd>
    </div>
  );
}

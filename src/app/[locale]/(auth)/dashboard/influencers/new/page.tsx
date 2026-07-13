'use client';

import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Mic, Sparkles, UserRound, X } from 'lucide-react';
import { CldImage, CldUploadWidget, type CloudinaryUploadWidgetOptions } from 'next-cloudinary';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type Dispatch, type SetStateAction, useState } from 'react';

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

// ElevenLabs curated stock voices — no cloning at v1 (see brainstorm §10)
const VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', accent: 'american', vibe: 'warm' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male', accent: 'american', vibe: 'natural' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male', accent: 'british', vibe: 'authoritative' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female', accent: 'british', vibe: 'confident' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'male', accent: 'australian', vibe: 'chill' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female', accent: 'british', vibe: 'sweet' },
];

const MIN_REFERENCES = 3;
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
};

type Step = 'traits' | 'references' | 'voice' | 'persona';
const STEPS: Step[] = ['traits', 'references', 'voice', 'persona'];

export default function NewInfluencerPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('traits');
  const [traits, setTraits] = useState<Traits>(EMPTY_TRAITS);
  const [references, setReferences] = useState<string[]>([]);
  const [voiceId, setVoiceId] = useState<string>('');
  const [personaPrompt, setPersonaPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(step);
  const canNext = stepGuard(step, traits, references, voiceId, personaPrompt);

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

  async function handleSubmit() {
    if (submitting) return;
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

      // 2. Kick off LoRA training (fire and forget — user sees training banner on detail page)
      await fetch(`/api/ai-influencers/${id}/train-lora`, { method: 'POST' })
        .catch(err => console.warn('[Wizard] train-lora kickoff failed:', err));

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
        {step === 'voice' && <VoiceStep voiceId={voiceId} setVoiceId={setVoiceId} />}
        {step === 'persona' && (
          <PersonaStep personaPrompt={personaPrompt} setPersonaPrompt={setPersonaPrompt} />
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
                {submitting ? 'Creating…' : 'Create & Start Training'}
              </button>
            )}
      </div>
    </>
  );
}

function stepGuard(step: Step, traits: Traits, references: string[], voiceId: string, personaPrompt: string): boolean {
  if (step === 'traits') {
    return traits.name.trim().length > 0 && traits.gender.length > 0 && traits.ageRange.length > 0;
  }
  if (step === 'references') {
    return references.length >= MIN_REFERENCES;
  }
  if (step === 'voice') {
    return voiceId.length > 0;
  }
  if (step === 'persona') {
    return personaPrompt.trim().length > 20;
  }
  return false;
}

function StepIndicator({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step);
  const labels: Record<Step, string> = {
    traits: 'Traits',
    references: 'References',
    voice: 'Voice',
    persona: 'Persona',
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
        <label className="mb-1 block text-sm font-medium" htmlFor="influencer-name">Name</label>
        <input
          id="influencer-name"
          type="text"
          value={traits.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Sarah, Jake, Maya…"
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
          the LoRA lock the identity across generations.
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
              if (!info?.public_id) return;
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
function VoiceStep({ voiceId, setVoiceId }: { voiceId: string; setVoiceId: (v: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mic size={16} />
          Pick a voice
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          ElevenLabs stock voices. This will be the voice-over for every talking-head video
          generated from this influencer. Voice cloning ships in a later phase.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {VOICES.map(v => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVoiceId(v.id)}
            className={`flex items-center justify-between rounded-md border p-3 text-left text-sm transition ${
              voiceId === v.id
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted'
            }`}
          >
            <div>
              <div className="font-medium">{v.name}</div>
              <div className="text-xs capitalize text-muted-foreground">
                {v.gender}
                {' '}
                ·
                {v.accent}
                {' '}
                ·
                {v.vibe}
              </div>
            </div>
            {voiceId === v.id && <span className="text-xs font-medium text-primary">Selected</span>}
          </button>
        ))}
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

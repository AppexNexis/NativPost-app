'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  Globe,
  Loader2,
  MessageSquare,
  Palette,
  RefreshCw,
  Sparkles,
  Upload,
  User,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { parseAsInteger, useQueryState } from 'nuqs';
import { useState } from 'react';

import {
  type BrandProfileData,
  useBrandProfile,
} from '@/features/brand-profile/useBrandProfile';

// -----------------------------------------------------------
// STEPS CONFIG
// -----------------------------------------------------------
const STEPS = [
  { id: 'business_basics', label: 'Business basics', shortLabel: 'Basics', icon: User },
  { id: 'voice_personality', label: 'Voice & tone', shortLabel: 'Voice', icon: MessageSquare },
  { id: 'visual_identity', label: 'Visual identity', shortLabel: 'Visual', icon: Palette },
  { id: 'content_preferences', label: 'Content preferences', shortLabel: 'Content', icon: Sparkles },
  { id: 'platform_voices', label: 'Platform voices', shortLabel: 'Platforms', icon: Globe },
  { id: 'review', label: 'Review', shortLabel: 'Review', icon: Eye },
] as const;

// -----------------------------------------------------------
// VALIDATION
// -----------------------------------------------------------
function validateStep(stepId: string, data: BrandProfileData): string[] {
  const errors: string[] = [];
  switch (stepId) {
    case 'business_basics':
      if (!data.brandName.trim()) {
        errors.push('Brand name is required.');
      }
      if (!data.industry.trim()) {
        errors.push('Industry is required.');
      }
      if (!data.targetAudience.trim()) {
        errors.push('Target audience is required.');
      }
      if (!data.companyDescription.trim()) {
        errors.push('Business description is required.');
      }
      break;
    case 'voice_personality':
      if (!data.communicationStyle.trim()) {
        errors.push('Communication style is required.');
      }
      break;
  }
  return errors;
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function OnboardingPage() {
  const router = useRouter();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const [currentStep, setCurrentStep] = useQueryState(
    'step',
    parseAsInteger.withDefault(0),
  );

  const { data, updateData, isLoading, isSaving, save, error, hasDraft, discardDraft } = useBrandProfile();

  const safeStep = Math.max(0, Math.min(currentStep, STEPS.length - 1));
  const step = STEPS[safeStep]!;
  const isFirst = safeStep === 0;
  const isLast = safeStep === STEPS.length - 1;

  const handleNext = async () => {
    const errors = validateStep(step.id, data);
    if (errors.length > 0) {
      setValidationErrors(errors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setValidationErrors([]);
    if (isLast) {
      const success = await save();
      if (success) {
        router.push('/dashboard/brand-profile');
      }
    } else {
      setCurrentStep(safeStep + 1);
    }
  };

  const handleBack = () => {
    setValidationErrors([]);
    if (!isFirst) {
      setCurrentStep(safeStep - 1);
    }
  };

  const handleStepClick = (index: number) => {
    if (index <= safeStep) {
      setValidationErrors([]);
      setCurrentStep(index);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Brand Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          NativPost uses this information to generate content that matches your brand's voice, visuals, and strategy.
        </p>
      </div>

      {/* Draft recovery banner */}
      {hasDraft && (
        <div className="mb-5 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
            <RefreshCw className="size-4 shrink-0" />
            <span>Unsaved changes have been restored.</span>
          </div>
          <button
            type="button"
            onClick={discardDraft}
            className="ml-4 shrink-0 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400"
          >
            Discard changes
          </button>
        </div>
      )}

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const isCompleted = i < safeStep;
            const isCurrent = i === safeStep;
            return (
              <div key={s.id} className="flex flex-1 items-center">
                <button
                  type="button"
                  onClick={() => handleStepClick(i)}
                  disabled={i > safeStep}
                  title={s.label}
                  className={`relative flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all
                    ${isCompleted ? 'cursor-pointer bg-primary text-white hover:bg-primary/90'
                : isCurrent ? 'bg-primary text-white ring-4 ring-primary/20'
                  : 'cursor-not-allowed bg-muted text-muted-foreground'}`}
                >
                  {isCompleted ? <Check className="size-3.5" /> : <span>{i + 1}</span>}
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 transition-colors ${i < safeStep ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`flex-1 text-center text-xs transition-colors
                ${i === safeStep ? 'font-semibold text-primary' : i < safeStep ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
            >
              {s.shortLabel}
            </div>
          ))}
        </div>
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/30">
          <p className="mb-1 text-sm font-semibold text-red-700 dark:text-red-400">Required fields are missing:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {validationErrors.map(err => (
              <li key={err} className="text-sm text-red-600 dark:text-red-400">{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* API error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="mb-8 rounded-xl border bg-card p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-2 border-b pb-4">
          <step.icon className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{step.label}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {safeStep + 1}
            {' '}
            of
            {' '}
            {STEPS.length}
          </span>
        </div>

        {step.id === 'business_basics' && <StepBusinessBasics data={data} onChange={updateData} errors={validationErrors} />}
        {step.id === 'voice_personality' && <StepVoicePersonality data={data} onChange={updateData} errors={validationErrors} />}
        {step.id === 'visual_identity' && <StepVisualIdentity data={data} onChange={updateData} errors={validationErrors} />}
        {step.id === 'content_preferences' && <StepContentPreferences data={data} onChange={updateData} errors={validationErrors} />}
        {step.id === 'platform_voices' && <StepPlatformVoices data={data} onChange={updateData} errors={validationErrors} />}
        {step.id === 'review' && <StepReview data={data} />}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={isFirst}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        <div className="flex items-center gap-3">
          {hasDraft && !isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3" />
              Draft saved
            </span>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isSaving
              ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                )
              : isLast
                ? (
                    <>
                      <Check className="size-4" />
                      Save profile
                    </>
                  )
                : (
                    <>
                      Continue
                      <ArrowRight className="size-4" />
                    </>
                  )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP COMPONENTS
// ============================================================

type StepProps = {
  data: BrandProfileData;
  onChange: (updates: Partial<BrandProfileData>) => void;
  errors: string[];
};

function hasFieldError(errors: string[], keyword: string) {
  return errors.some(e => e.toLowerCase().includes(keyword.toLowerCase()));
}

// ── Step 1: Business Basics ──────────────────────────────────
function StepBusinessBasics({ data, onChange, errors }: StepProps) {
  return (
    <div className="space-y-5">
      <FormField
        label="Brand name"
        hint="The name used in generated content and across all platforms."
        placeholder="e.g. Acme Corp"
        value={data.brandName}
        onChange={v => onChange({ brandName: v })}
        required
        invalid={hasFieldError(errors, 'brand name')}
      />
      <FormField
        label="Industry"
        hint="Used to calibrate tone, terminology, and relevant topics."
        placeholder="e.g. B2B SaaS, Retail, Professional Services, Healthcare"
        value={data.industry}
        onChange={v => onChange({ industry: v })}
        required
        invalid={hasFieldError(errors, 'industry')}
      />
      <FormTextarea
        label="Target audience"
        hint="Describe who your content is written for. The more specific, the better."
        placeholder="e.g. Operations managers at mid-size logistics companies who are evaluating fleet software"
        value={data.targetAudience}
        onChange={v => onChange({ targetAudience: v })}
        rows={3}
        required
        invalid={hasFieldError(errors, 'target audience')}
      />
      <FormTextarea
        label="Business description"
        hint="What your company does, who it serves, and what differentiates it. This is used in every prompt."
        placeholder="e.g. We help logistics companies reduce fuel costs by 20% through real-time route optimization. Unlike competitors, we integrate directly with existing fleet management systems."
        value={data.companyDescription}
        onChange={v => onChange({ companyDescription: v })}
        rows={5}
        required
        invalid={hasFieldError(errors, 'business description')}
      />
      <FormField
        label="Website"
        hint="Optional. Used for reference when generating platform bios and link-in-bio copy."
        placeholder="https://example.com"
        value={data.websiteUrl}
        onChange={v => onChange({ websiteUrl: v })}
        type="url"
      />
    </div>
  );
}

// ── Step 2: Voice & Tone ─────────────────────────────────────
function StepVoicePersonality({ data, onChange, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <ToneSlider
          label="Formality"
          leftLabel="Casual"
          rightLabel="Formal"
          hint="A score of 3 reads like a text from a colleague. A 9 reads like a board memo."
          value={data.toneFormality}
          onChange={v => onChange({ toneFormality: v })}
        />
        <ToneSlider
          label="Humor"
          leftLabel="Serious"
          rightLabel="Playful"
          hint="Controls how much wit and levity appears in the copy."
          value={data.toneHumor}
          onChange={v => onChange({ toneHumor: v })}
        />
        <ToneSlider
          label="Energy"
          leftLabel="Measured"
          rightLabel="Bold"
          hint="Higher energy means stronger verbs, shorter sentences, more urgency."
          value={data.toneEnergy}
          onChange={v => onChange({ toneEnergy: v })}
        />
      </div>
      <FormTextarea
        label="Communication style"
        hint="Describe your brand's voice in plain terms. This is sent directly to the AI as a style instruction."
        placeholder="e.g. Direct and evidence-led. We cite data before making claims. We avoid corporate jargon and never use buzzwords like 'synergy' or 'thought leadership'. We write the way a knowledgeable colleague would explain something over lunch."
        value={data.communicationStyle}
        onChange={v => onChange({ communicationStyle: v })}
        rows={5}
        required
        invalid={hasFieldError(errors, 'communication style')}
      />
      <TagInput
        label="Preferred vocabulary"
        hint="Words and phrases you want the AI to use. Press Enter after each one."
        placeholder="Add a word or phrase"
        tags={data.vocabulary}
        onChange={tags => onChange({ vocabulary: tags })}
      />
      <TagInput
        label="Excluded vocabulary"
        hint="Words and phrases the AI should never use. Press Enter after each one."
        placeholder="Add a word or phrase"
        tags={data.forbiddenWords}
        onChange={tags => onChange({ forbiddenWords: tags })}
      />
    </div>
  );
}

// ── Step 3: Visual Identity ──────────────────────────────────
function StepVisualIdentity({ data, onChange }: StepProps) {
  const imageStyles = [
    { value: 'minimal', label: 'Minimal' },
    { value: 'vibrant', label: 'Vibrant' },
    { value: 'professional', label: 'Professional' },
    { value: 'bold', label: 'Bold' },
    { value: 'warm', label: 'Warm' },
    { value: 'luxury', label: 'Luxury' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-sm font-medium">Brand colors</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Used in video templates, overlays, and branded graphics.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <ColorPicker label="Primary" value={data.primaryColor} onChange={v => onChange({ primaryColor: v })} />
          <ColorPicker label="Secondary" value={data.secondaryColor} onChange={v => onChange({ secondaryColor: v })} />
          <ColorPicker label="Accent" value={data.accentColor} onChange={v => onChange({ accentColor: v })} />
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Image aesthetic</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Controls the visual direction for AI-selected or generated imagery.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {imageStyles.map(style => (
            <button
              type="button"
              key={style.value}
              onClick={() => onChange({ imageStyle: style.value })}
              className={`rounded-lg border px-4 py-3 text-left text-sm transition-all ${data.imageStyle === style.value ? 'border-primary bg-primary/5 font-medium text-primary' : 'hover:bg-muted'}`}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      <FormField
        label="Typography preference"
        hint="Optional. Describe your preferred font style for use in visual briefs."
        placeholder="e.g. Geometric sans-serif, Classic serif"
        value={data.fontPreference}
        onChange={v => onChange({ fontPreference: v })}
      />

      <LogoUploader
        value={data.logoUrl}
        onChange={v => onChange({ logoUrl: v })}
      />
    </div>
  );
}

// ── Step 4: Content Preferences ──────────────────────────────
function StepContentPreferences({ data, onChange }: StepProps) {
  return (
    <div className="space-y-6">
      <TagInput
        label="Content references"
        hint="URLs or names of brands, posts, or campaigns whose content quality you admire. Used as stylistic reference."
        placeholder="Add a URL or brand name"
        tags={data.contentExamples}
        onChange={tags => onChange({ contentExamples: tags })}
      />
      <TagInput
        label="Content to avoid"
        hint="Specific formats, tropes, or approaches you do not want. Be explicit."
        placeholder="e.g. No stock photos of handshakes"
        tags={data.antiPatterns}
        onChange={tags => onChange({ antiPatterns: tags })}
      />
      <FormTextarea
        label="Hashtag strategy"
        hint="Describe how hashtags should be used. This instruction is applied to every post."
        placeholder="e.g. Use 5–8 hashtags per post. Always include #CompanyName. Prioritize niche industry tags over broad ones."
        value={data.hashtagStrategy}
        onChange={v => onChange({ hashtagStrategy: v })}
        rows={3}
      />
    </div>
  );
}

// ── Step 5: Platform Voices ──────────────────────────────────
function StepPlatformVoices({ data, onChange }: StepProps) {
  const platforms = [
    {
      key: 'linkedinVoice' as const,
      label: 'LinkedIn',
      hint: 'LinkedIn content skews professional. Note any specific format preferences (e.g. long-form, carousels).',
      placeholder: 'e.g. Longer posts with a clear insight in the opening line. No motivational platitudes. End with a direct question.',
    },
    {
      key: 'instagramVoice' as const,
      label: 'Instagram',
      hint: 'Describe caption length, visual references, and tone differences from your default voice.',
      placeholder: 'e.g. Short captions, 3–4 lines max. Lead with the visual concept. Conversational.',
    },
    {
      key: 'twitterVoice' as const,
      label: 'X / Twitter',
      hint: 'Note character count preferences, threading style, and whether replies differ from original posts.',
      placeholder: 'e.g. One strong observation per tweet. No threads unless sharing a data point. No rhetorical questions.',
    },
    {
      key: 'facebookVoice' as const,
      label: 'Facebook',
      hint: 'Describe community focus, whether you use it for events, offers, or general updates.',
      placeholder: 'e.g. Community-oriented, announce events and offers, slightly warmer than LinkedIn.',
    },
    {
      key: 'tiktokVoice' as const,
      label: 'TikTok',
      hint: 'TikTok requires a distinct script style. Note hook preferences, pacing, and call-to-action style.',
      placeholder: 'e.g. Hook in the first 2 seconds. Use pattern interrupts. Captions should match spoken audio.',
    },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Describe how your brand voice should adapt per platform. Leave any platform blank if you do not post there.
      </p>
      {platforms.map(p => (
        <FormTextarea
          key={p.key}
          label={p.label}
          hint={p.hint}
          placeholder={p.placeholder}
          value={data[p.key]}
          onChange={v => onChange({ [p.key]: v })}
          rows={2}
        />
      ))}
    </div>
  );
}

// ── Step 6: Review ───────────────────────────────────────────
function StepReview({ data }: { data: BrandProfileData }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Review your entries before saving. You can return to any step using the Back button or the step indicators above.
      </p>

      <ReviewSection title="Business basics">
        <ReviewItem label="Brand name" value={data.brandName} />
        <ReviewItem label="Industry" value={data.industry} />
        <ReviewItem label="Target audience" value={data.targetAudience} />
        <ReviewItem label="Website" value={data.websiteUrl} />
        {data.companyDescription && <ReviewItem label="Description" value={data.companyDescription} />}
      </ReviewSection>

      <ReviewSection title="Voice & tone">
        <div className="grid gap-2 sm:grid-cols-3">
          <ReviewItem label="Formality" value={`${data.toneFormality}/10`} />
          <ReviewItem label="Humor" value={`${data.toneHumor}/10`} />
          <ReviewItem label="Energy" value={`${data.toneEnergy}/10`} />
        </div>
        {data.communicationStyle && <ReviewItem label="Style" value={data.communicationStyle} />}
        {data.vocabulary.length > 0 && <ReviewItem label="Preferred vocabulary" value={data.vocabulary.join(', ')} />}
        {data.forbiddenWords.length > 0 && <ReviewItem label="Excluded vocabulary" value={data.forbiddenWords.join(', ')} />}
      </ReviewSection>

      <ReviewSection title="Visual identity">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Colors</span>
          {[data.primaryColor, data.secondaryColor, data.accentColor].filter(Boolean).map(c => (
            <div key={c} className="flex items-center gap-1">
              <div className="size-5 rounded border" style={{ backgroundColor: c }} />
              <span className="font-mono text-xs text-muted-foreground">{c}</span>
            </div>
          ))}
        </div>
        {data.imageStyle && <ReviewItem label="Image aesthetic" value={data.imageStyle} />}
        {data.fontPreference && <ReviewItem label="Typography" value={data.fontPreference} />}
        {data.logoUrl && (
          <div>
            <span className="text-xs text-muted-foreground">Logo</span>
            <div className="mt-1">
              <Image src={data.logoUrl} alt="Brand logo" width={80} height={40} unoptimized className="rounded border object-contain" />
            </div>
          </div>
        )}
      </ReviewSection>

      {(data.contentExamples.length > 0 || data.antiPatterns.length > 0 || data.hashtagStrategy) && (
        <ReviewSection title="Content preferences">
          {data.contentExamples.length > 0 && <ReviewItem label="References" value={data.contentExamples.join(', ')} />}
          {data.antiPatterns.length > 0 && <ReviewItem label="Avoid" value={data.antiPatterns.join(', ')} />}
          {data.hashtagStrategy && <ReviewItem label="Hashtag strategy" value={data.hashtagStrategy} />}
        </ReviewSection>
      )}

      {[data.linkedinVoice, data.instagramVoice, data.twitterVoice, data.facebookVoice, data.tiktokVoice].some(Boolean) && (
        <ReviewSection title="Platform voices">
          {data.linkedinVoice && <ReviewItem label="LinkedIn" value={data.linkedinVoice} />}
          {data.instagramVoice && <ReviewItem label="Instagram" value={data.instagramVoice} />}
          {data.twitterVoice && <ReviewItem label="X / Twitter" value={data.twitterVoice} />}
          {data.facebookVoice && <ReviewItem label="Facebook" value={data.facebookVoice} />}
          {data.tiktokVoice && <ReviewItem label="TikTok" value={data.tiktokVoice} />}
        </ReviewSection>
      )}
    </div>
  );
}

// ============================================================
// REUSABLE FORM COMPONENTS
// ============================================================

function FormField({
  label,
  hint,
  placeholder,
  value,
  onChange,
  type = 'text',
  required,
  invalid,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  invalid?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {hint && <p className="mb-1.5 text-xs text-muted-foreground">{hint}</p>}
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 ${invalid ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : 'focus:border-primary focus:ring-primary/20'}`}
      />
      {invalid && <p className="mt-1 text-xs text-red-500">This field is required.</p>}
    </div>
  );
}

function FormTextarea({
  label,
  hint,
  placeholder,
  value,
  onChange,
  rows = 3,
  required,
  invalid,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  required?: boolean;
  invalid?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {hint && <p className="mb-1.5 text-xs text-muted-foreground">{hint}</p>}
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full resize-none rounded-lg border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 ${invalid ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : 'focus:border-primary focus:ring-primary/20'}`}
      />
      {invalid && <p className="mt-1 text-xs text-red-500">This field is required.</p>}
    </div>
  );
}

function ToneSlider({
  label,
  leftLabel,
  rightLabel,
  hint,
  value,
  onChange,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {value}
          /10
        </span>
      </div>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

function TagInput({
  label,
  hint,
  placeholder,
  tags,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {hint && <p className="mb-1.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="flex min-h-[42px] flex-wrap gap-1.5 rounded-lg border bg-background p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 rounded border bg-muted px-2 py-0.5 text-xs font-medium">
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter(t => t !== tag))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (input.trim()) {
              addTag(input);
            }
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="min-w-[140px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-transparent font-mono text-sm uppercase outline-none"
          maxLength={7}
        />
      </div>
    </div>
  );
}

// ── Logo Uploader using Uploadcare ───────────────────────────
function LogoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const publicKey = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || '';

  const handleFile = async (file: File) => {
    if (!file) {
      return;
    }

    const maxMb = 2;
    if (file.size > maxMb * 1024 * 1024) {
      setUploadError(`File must be under ${maxMb}MB.`);
      return;
    }

    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setUploadError('Only PNG, JPG, SVG, or WebP files are accepted.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const form = new FormData();
      form.append('UPLOADCARE_PUB_KEY', publicKey);
      form.append('UPLOADCARE_STORE', '1');
      form.append('file', file);

      const res = await fetch('https://upload.uploadcare.com/base/', {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json() as { file: string };
      onChange(`https://32v3ws8ss0.ucarecd.net/${data.file}/`);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <div>
      <p className="mb-1 text-sm font-medium">Logo</p>
      <p className="mb-2 text-xs text-muted-foreground">
        Used in branded video outros and profile pages. PNG, SVG, JPG or WebP, max 2MB.
      </p>

      {/* Hidden file input — always in DOM so it can always be triggered */}
      <input
        id="logo-upload"
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            handleFile(f);
          }
        }}
      />

      {value
        ? (
            <div className="flex items-center gap-4 rounded-lg border bg-background p-3">
              <Image
                src={value}
                alt="Logo preview"
                width={80}
                height={40}
                unoptimized
                className="max-h-10 w-auto rounded object-contain"
              />
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">Logo uploaded</p>
                <div className="flex gap-3">
                  <label
                    htmlFor="logo-upload"
                    className="cursor-pointer text-xs text-primary hover:underline"
                  >
                    Replace
                  </label>
                  <button
                    type="button"
                    onClick={() => onChange('')}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          )
        : (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload logo"
              className="flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/20 p-4 text-center transition-colors hover:bg-muted/40"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById('logo-upload')?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  document.getElementById('logo-upload')?.click();
                }
              }}
            >
              {isUploading
                ? (
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  )
                : (
                    <>
                      <Upload className="size-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Click to upload or drag and drop
                      </span>
                      <span className="text-xs text-muted-foreground/60">PNG, SVG, JPG, WebP — max 2MB</span>
                    </>
                  )}
            </div>
          )}

      {uploadError && <p className="mt-1.5 text-xs text-red-500">{uploadError}</p>}
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewItem({ label, value }: { label?: string; value: string }) {
  if (!value) {
    return null;
  }
  return (
    <div className="text-sm">
      {label && (
        <span className="font-medium">
          {label}
          :
          {' '}
        </span>
      )}
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

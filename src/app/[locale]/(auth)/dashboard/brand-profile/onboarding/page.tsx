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
  Pencil,
  RefreshCw,
  Sparkles,
  User,
} from 'lucide-react';
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
  { id: 'voice_personality', label: 'Voice & personality', shortLabel: 'Voice', icon: MessageSquare },
  { id: 'visual_identity', label: 'Visual identity', shortLabel: 'Visual', icon: Palette },
  { id: 'content_preferences', label: 'Content preferences', shortLabel: 'Content', icon: Sparkles },
  { id: 'platform_voices', label: 'Platform voices', shortLabel: 'Platforms', icon: Globe },
  { id: 'review', label: 'Review & launch', shortLabel: 'Review', icon: Eye },
] as const;

// -----------------------------------------------------------
// VALIDATION — required fields per step
// Returns an array of error messages. Empty array = valid.
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

    // Steps 3-5 are all optional — no required fields
    case 'visual_identity':
    case 'content_preferences':
    case 'platform_voices':
    case 'review':
      break;
  }

  return errors;
}

// -----------------------------------------------------------
// ONBOARDING PAGE
// -----------------------------------------------------------
export default function OnboardingPage() {
  const router = useRouter();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const [currentStep, setCurrentStep] = useQueryState(
    'step',
    parseAsInteger.withDefault(0),
  );

  const {
    data,
    updateData,
    isLoading,
    isSaving,
    save,
    error,
    hasDraft,
    discardDraft,
  } = useBrandProfile();

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
        <h1 className="text-2xl font-semibold tracking-tight">Build your Brand Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This is how NativPost learns to create content that sounds and looks like your brand.
          Take your time — the better this is, the better your content will be.
        </p>
      </div>

      {/* Draft recovery banner */}
      {hasDraft && (
        <div className="mb-5 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
            <Pencil className="size-4 shrink-0" />
            <span>You have unsaved changes — your draft has been restored.</span>
          </div>
          <button
            type="button"
            onClick={discardDraft}
            className="ml-4 shrink-0 text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-900 dark:text-amber-400"
          >
            Discard draft
          </button>
        </div>
      )}

      {/* --------------------------------------------------------
          STEP INDICATOR
          Numbered circles + connecting lines — no overflow, clean
      -------------------------------------------------------- */}
      <div className="mb-8">
        {/* Circles + connectors */}
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
                    ${isCompleted
                ? 'cursor-pointer bg-primary text-white hover:bg-primary/90'
                : isCurrent
                  ? 'bg-primary text-white ring-4 ring-primary/20'
                  : 'cursor-not-allowed bg-muted text-muted-foreground'
              }`}
                >
                  {isCompleted ? <Check className="size-3.5" /> : <span>{i + 1}</span>}
                </button>

                {/* Connector — skip after last */}
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 transition-colors ${i < safeStep ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Labels below circles */}
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
          <p className="mb-1 text-sm font-semibold text-red-700 dark:text-red-400">
            Please fix the following before continuing:
          </p>
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
        <div className="mb-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <step.icon className="size-3.5" />
          <span>
            Step
            {safeStep + 1}
            {' '}
            of
            {STEPS.length}
            {' '}
            —
            {step.label}
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
                      Save & launch
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

function StepBusinessBasics({ data, onChange, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tell us about your business</h2>
        <p className="mt-1 text-sm text-muted-foreground">The basics help us understand who you are and who you're talking to.</p>
      </div>
      <div className="space-y-4">
        <FormField label="Brand name" placeholder="e.g. Acme Inc, The Coffee House" value={data.brandName} onChange={v => onChange({ brandName: v })} required invalid={hasFieldError(errors, 'brand name')} />
        <FormField label="Industry" placeholder="e.g. SaaS, Restaurant, Real Estate, Fitness" value={data.industry} onChange={v => onChange({ industry: v })} required invalid={hasFieldError(errors, 'industry')} />
        <FormTextarea label="Who is your target audience?" placeholder="e.g. Small business owners aged 25-45 who want to grow their social media presence" value={data.targetAudience} onChange={v => onChange({ targetAudience: v })} rows={3} required invalid={hasFieldError(errors, 'target audience')} />
        <FormTextarea label="Describe your business in a few sentences" placeholder="What do you do? What makes you different? What problems do you solve?" value={data.companyDescription} onChange={v => onChange({ companyDescription: v })} rows={4} required invalid={hasFieldError(errors, 'business description')} />
        <FormField label="Website URL" placeholder="https://your-website.com" value={data.websiteUrl} onChange={v => onChange({ websiteUrl: v })} type="url" />
      </div>
    </div>
  );
}

function StepVoicePersonality({ data, onChange, errors }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Define your brand voice</h2>
        <p className="mt-1 text-sm text-muted-foreground">These sliders shape the personality of every piece of content we create.</p>
      </div>
      <ToneSlider label="Formality" leftLabel="Very casual" rightLabel="Very formal" value={data.toneFormality} onChange={v => onChange({ toneFormality: v })} />
      <ToneSlider label="Humor" leftLabel="Serious & direct" rightLabel="Playful & witty" value={data.toneHumor} onChange={v => onChange({ toneHumor: v })} />
      <ToneSlider label="Energy" leftLabel="Calm & measured" rightLabel="Energetic & bold" value={data.toneEnergy} onChange={v => onChange({ toneEnergy: v })} />
      <FormTextarea label="How would you describe your communication style?" placeholder="e.g. We're like that smart friend who explains complex things simply. Warm but not cheesy." value={data.communicationStyle} onChange={v => onChange({ communicationStyle: v })} rows={4} required invalid={hasFieldError(errors, 'communication style')} />
      <TagInput label="Preferred words & phrases" placeholder="Type a word and press Enter" helpText="Words you want in your content. e.g., 'handcrafted', 'premium'" tags={data.vocabulary} onChange={tags => onChange({ vocabulary: tags })} />
      <TagInput label="Forbidden words" placeholder="Type a word and press Enter" helpText="Words NativPost should NEVER use. e.g., 'cheap', 'AI-powered', 'synergy'" tags={data.forbiddenWords} onChange={tags => onChange({ forbiddenWords: tags })} />
    </div>
  );
}

function StepVisualIdentity({ data, onChange, errors: _e }: StepProps) {
  const imageStyles = [
    { value: 'minimal', label: 'Minimal & clean' },
    { value: 'vibrant', label: 'Vibrant & colorful' },
    { value: 'professional', label: 'Professional & polished' },
    { value: 'bold', label: 'Bold & edgy' },
    { value: 'warm', label: 'Warm & organic' },
    { value: 'luxury', label: 'Luxury & refined' },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Your visual identity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Colors, typography, and overall aesthetic.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <ColorPicker label="Primary color" value={data.primaryColor} onChange={v => onChange({ primaryColor: v })} />
        <ColorPicker label="Secondary color" value={data.secondaryColor} onChange={v => onChange({ secondaryColor: v })} />
        <ColorPicker label="Accent color" value={data.accentColor} onChange={v => onChange({ accentColor: v })} />
      </div>
      <FormField label="Font preference" placeholder="e.g. Modern sans-serif, Classic serif" value={data.fontPreference} onChange={v => onChange({ fontPreference: v })} />
      <div>
        <p className="mb-2 text-sm font-medium">Image style</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {imageStyles.map(style => (
            <button type="button" key={style.value} onClick={() => onChange({ imageStyle: style.value })} className={`rounded-lg border px-4 py-3 text-left text-sm transition-all ${data.imageStyle === style.value ? 'border-primary bg-primary/5 font-medium text-primary' : 'hover:bg-muted'}`}>
              {style.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Logo upload</p>
        <div className="flex min-h-[120px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50">
          <div>
            <p className="font-medium">Click or drag to upload your logo</p>
            <p className="mt-1 text-xs">PNG, SVG, or JPG. Max 2MB.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepContentPreferences({ data, onChange, errors: _e }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Content preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">What kind of content you love — and what to avoid.</p>
      </div>
      <TagInput label="Content you admire" placeholder="Paste a URL or describe content you like" helpText="Share links or descriptions of social posts, brands, or campaigns you love." tags={data.contentExamples} onChange={tags => onChange({ contentExamples: tags })} />
      <TagInput label="Anti-patterns (things to avoid)" placeholder="Describe something to avoid" helpText="e.g. 'Never use stock photos of people', 'No motivational quotes'" tags={data.antiPatterns} onChange={tags => onChange({ antiPatterns: tags })} />
      <FormTextarea label="Hashtag strategy" placeholder="e.g. Use 5-10 relevant industry hashtags per post. Always include #YourBrand." value={data.hashtagStrategy} onChange={v => onChange({ hashtagStrategy: v })} rows={3} />
    </div>
  );
}

function StepPlatformVoices({ data, onChange, errors: _e }: StepProps) {
  const platforms = [
    { key: 'linkedinVoice' as const, label: 'LinkedIn', placeholder: 'e.g. More professional, longer posts, share industry insights' },
    { key: 'instagramVoice' as const, label: 'Instagram', placeholder: 'e.g. Visual-first, casual captions, behind-the-scenes' },
    { key: 'twitterVoice' as const, label: 'X / Twitter', placeholder: 'e.g. Shorter, punchier, join conversations, quick takes' },
    { key: 'facebookVoice' as const, label: 'Facebook', placeholder: 'e.g. Community-focused, share events and updates' },
    { key: 'tiktokVoice' as const, label: 'TikTok', placeholder: 'e.g. Trend-aware, entertaining, show personality' },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Platform-specific preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your brand can sound slightly different on each platform. Leave blank for platforms you don't use.</p>
      </div>
      <div className="space-y-4">
        {platforms.map(p => (
          <FormTextarea key={p.key} label={p.label} placeholder={p.placeholder} value={data[p.key]} onChange={v => onChange({ [p.key]: v })} rows={2} />
        ))}
      </div>
    </div>
  );
}

function StepReview({ data }: { data: BrandProfileData }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Review your Brand Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">Take a final look. You can always edit later.</p>
      </div>
      <ReviewSection title="Business basics">
        <ReviewItem label="Brand name" value={data.brandName} />
        <ReviewItem label="Industry" value={data.industry} />
        <ReviewItem label="Target audience" value={data.targetAudience} />
        <ReviewItem label="Website" value={data.websiteUrl} />
      </ReviewSection>
      <ReviewSection title="Voice & personality">
        <div className="grid gap-2 sm:grid-cols-3">
          <ReviewItem label="Formality" value={`${data.toneFormality}/10`} />
          <ReviewItem label="Humor" value={`${data.toneHumor}/10`} />
          <ReviewItem label="Energy" value={`${data.toneEnergy}/10`} />
        </div>
        <ReviewItem label="Style" value={data.communicationStyle} />
        {data.vocabulary.length > 0 && <ReviewItem label="Preferred words" value={data.vocabulary.join(', ')} />}
        {data.forbiddenWords.length > 0 && <ReviewItem label="Forbidden words" value={data.forbiddenWords.join(', ')} />}
      </ReviewSection>
      <ReviewSection title="Visual identity">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Colors:</span>
          {[data.primaryColor, data.secondaryColor, data.accentColor].map(c => (
            <div key={c} className="size-6 rounded-full border" style={{ backgroundColor: c }} />
          ))}
        </div>
        <ReviewItem label="Image style" value={data.imageStyle} />
        <ReviewItem label="Font" value={data.fontPreference} />
      </ReviewSection>
      {data.antiPatterns.length > 0 && (
        <ReviewSection title="Anti-patterns">
          <ReviewItem value={data.antiPatterns.join(' · ')} />
        </ReviewSection>
      )}
      <div className="rounded-lg bg-primary/5 p-4 text-sm">
        <p className="font-medium text-primary">You're all set!</p>
        <p className="mt-1 text-muted-foreground">Click "Save & launch" to create your Brand Profile. NativPost will start generating content based on this profile.</p>
      </div>
    </div>
  );
}

// ============================================================
// REUSABLE FORM COMPONENTS
// ============================================================

function FormField({ label, placeholder, value, onChange, type = 'text', required, invalid }: {
  label: string;
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
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${invalid ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : 'focus:border-primary focus:ring-primary/20'}`}
      />
      {invalid && <p className="mt-1 text-xs text-red-500">This field is required.</p>}
    </div>
  );
}

function FormTextarea({ label, placeholder, value, onChange, rows = 3, required, invalid }: {
  label: string;
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
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full resize-none rounded-lg border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${invalid ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : 'focus:border-primary focus:ring-primary/20'}`}
      />
      {invalid && <p className="mt-1 text-xs text-red-500">This field is required.</p>}
    </div>
  );
}

function ToneSlider({ label, leftLabel, rightLabel, value, onChange }: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs font-medium text-muted-foreground">
          {value}
          /10
        </span>
      </div>
      <input type="range" min={1} max={10} value={value} onChange={e => onChange(Number(e.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary" />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

function TagInput({ label, placeholder, helpText, tags, onChange }: {
  label: string;
  placeholder: string;
  helpText?: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      if (!tags.includes(input.trim())) {
        onChange([...tags, input.trim()]);
      }
      setInput('');
    }
  };
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {helpText && <p className="mb-2 text-xs text-muted-foreground">{helpText}</p>}
      <div className="flex min-h-[42px] flex-wrap gap-1.5 rounded-lg border bg-background p-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} className="ml-0.5 text-muted-foreground hover:text-foreground">×</button>
          </span>
        ))}
        <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={tags.length === 0 ? placeholder : ''} className="min-w-[120px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground" />
      </div>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="size-8 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full bg-transparent font-mono text-sm uppercase outline-none" maxLength={7} />
      </div>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
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

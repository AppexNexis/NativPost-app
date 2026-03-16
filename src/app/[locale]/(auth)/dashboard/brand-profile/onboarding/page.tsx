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
  Sparkles,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  type BrandProfileData,
  useBrandProfile,
} from '@/features/brand-profile/useBrandProfile';

// -----------------------------------------------------------
// ONBOARDING STEPS CONFIG
// -----------------------------------------------------------
const STEPS = [
  { id: 'business_basics', label: 'Business basics', icon: User },
  { id: 'voice_personality', label: 'Voice & personality', icon: MessageSquare },
  { id: 'visual_identity', label: 'Visual identity', icon: Palette },
  { id: 'content_preferences', label: 'Content preferences', icon: Sparkles },
  { id: 'platform_voices', label: 'Platform voices', icon: Globe },
  { id: 'review', label: 'Review & launch', icon: Eye },
] as const;

// -----------------------------------------------------------
// ONBOARDING PAGE
// -----------------------------------------------------------
export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);

  // Real API hook — loads existing profile, provides save()
  const {
    data,
    updateData,
    isLoading,
    isSaving,
    save,
    error,
  } = useBrandProfile();

  const step = STEPS[currentStep]!;
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  const handleNext = async () => {
    if (isLast) {
      const success = await save();
      if (success) {
        router.push('/dashboard/brand-profile');
      }
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) setCurrentStep((prev) => prev - 1);
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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Build your Brand Profile
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This is how NativPost learns to create content that sounds and looks
          like your brand. Take your time — the better this is, the better your
          content will be.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= currentStep ? 'bg-[#16A34A]' : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <step.icon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Step {currentStep + 1} of {STEPS.length}
          </span>
          <span className="text-sm text-muted-foreground">— {step.label}</span>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="mb-8 rounded-xl border bg-card p-6 sm:p-8">
        {step.id === 'business_basics' && (
          <StepBusinessBasics data={data} onChange={updateData} />
        )}
        {step.id === 'voice_personality' && (
          <StepVoicePersonality data={data} onChange={updateData} />
        )}
        {step.id === 'visual_identity' && (
          <StepVisualIdentity data={data} onChange={updateData} />
        )}
        {step.id === 'content_preferences' && (
          <StepContentPreferences data={data} onChange={updateData} />
        )}
        {step.id === 'platform_voices' && (
          <StepPlatformVoices data={data} onChange={updateData} />
        )}
        {step.id === 'review' && <StepReview data={data} />}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={isFirst}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16A34A] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
        >
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : isLast ? (
            <>
              <Check className="size-4" />
              Save & launch
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// STEP COMPONENTS (same UI as before, using the hook's data)
// ============================================================

interface StepProps {
  data: BrandProfileData;
  onChange: (updates: Partial<BrandProfileData>) => void;
}

function StepBusinessBasics({ data, onChange }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tell us about your business</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The basics help us understand who you are and who you're talking to.
        </p>
      </div>
      <div className="space-y-4">
        <FormField label="Brand name" placeholder="e.g. Acme Inc, The Coffee House" value={data.brandName} onChange={(v) => onChange({ brandName: v })} required />
        <FormField label="Industry" placeholder="e.g. SaaS, Restaurant, Real Estate, Fitness" value={data.industry} onChange={(v) => onChange({ industry: v })} />
        <FormTextarea label="Who is your target audience?" placeholder="e.g. Small business owners aged 25-45 who want to grow their social media presence but don't have time to create content" value={data.targetAudience} onChange={(v) => onChange({ targetAudience: v })} rows={3} />
        <FormTextarea label="Describe your business in a few sentences" placeholder="What do you do? What makes you different? What problems do you solve?" value={data.companyDescription} onChange={(v) => onChange({ companyDescription: v })} rows={4} />
        <FormField label="Website URL" placeholder="https://your-website.com" value={data.websiteUrl} onChange={(v) => onChange({ websiteUrl: v })} type="url" />
      </div>
    </div>
  );
}

function StepVoicePersonality({ data, onChange }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Define your brand voice</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These sliders shape the personality of every piece of content we create.
        </p>
      </div>
      <div className="space-y-6">
        <ToneSlider label="Formality" leftLabel="Very casual" rightLabel="Very formal" value={data.toneFormality} onChange={(v) => onChange({ toneFormality: v })} />
        <ToneSlider label="Humor" leftLabel="Serious & direct" rightLabel="Playful & witty" value={data.toneHumor} onChange={(v) => onChange({ toneHumor: v })} />
        <ToneSlider label="Energy" leftLabel="Calm & measured" rightLabel="Energetic & bold" value={data.toneEnergy} onChange={(v) => onChange({ toneEnergy: v })} />
      </div>
      <FormTextarea label="How would you describe your communication style?" placeholder="e.g. We're like that smart friend who explains complex things simply. Warm but not cheesy." value={data.communicationStyle} onChange={(v) => onChange({ communicationStyle: v })} rows={4} />
      <TagInput label="Preferred words & phrases" placeholder="Type a word and press Enter" helpText="Words you want in your content. e.g., 'handcrafted', 'premium'" tags={data.vocabulary} onChange={(tags) => onChange({ vocabulary: tags })} />
      <TagInput label="Forbidden words" placeholder="Type a word and press Enter" helpText="Words NativPost should NEVER use. e.g., 'cheap', 'AI-powered', 'synergy'" tags={data.forbiddenWords} onChange={(tags) => onChange({ forbiddenWords: tags })} />
    </div>
  );
}

function StepVisualIdentity({ data, onChange }: StepProps) {
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
        <ColorPicker label="Primary color" value={data.primaryColor} onChange={(v) => onChange({ primaryColor: v })} />
        <ColorPicker label="Secondary color" value={data.secondaryColor} onChange={(v) => onChange({ secondaryColor: v })} />
        <ColorPicker label="Accent color" value={data.accentColor} onChange={(v) => onChange({ accentColor: v })} />
      </div>
      <FormField label="Font preference" placeholder="e.g. Modern sans-serif, Classic serif" value={data.fontPreference} onChange={(v) => onChange({ fontPreference: v })} />
      <div>
        <label className="mb-2 block text-sm font-medium">Image style</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {imageStyles.map((style) => (
            <button key={style.value} onClick={() => onChange({ imageStyle: style.value })} className={`rounded-lg border px-4 py-3 text-left text-sm transition-all ${data.imageStyle === style.value ? 'border-[#16A34A] bg-[#16A34A]/5 font-medium text-[#16A34A]' : 'hover:bg-muted'}`}>
              {style.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium">Logo upload</label>
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

function StepContentPreferences({ data, onChange }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Content preferences</h2>
        <p className="mt-1 text-sm text-muted-foreground">What kind of content you love — and what to avoid.</p>
      </div>
      <TagInput label="Content you admire" placeholder="Paste a URL or describe content you like" helpText="Share links or descriptions of social posts, brands, or campaigns you love." tags={data.contentExamples} onChange={(tags) => onChange({ contentExamples: tags })} />
      <TagInput label="Anti-patterns (things to avoid)" placeholder="Describe something to avoid" helpText="e.g. 'Never use stock photos of people', 'No motivational quotes'" tags={data.antiPatterns} onChange={(tags) => onChange({ antiPatterns: tags })} />
      <FormTextarea label="Hashtag strategy" placeholder="e.g. Use 5-10 relevant industry hashtags per post. Always include #AcmeBuilds." value={data.hashtagStrategy} onChange={(v) => onChange({ hashtagStrategy: v })} rows={3} />
    </div>
  );
}

function StepPlatformVoices({ data, onChange }: StepProps) {
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
        {platforms.map((p) => (
          <FormTextarea key={p.key} label={p.label} placeholder={p.placeholder} value={data[p.key]} onChange={(v) => onChange({ [p.key]: v })} rows={2} />
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
          {[data.primaryColor, data.secondaryColor, data.accentColor].map((c, i) => (
            <div key={i} className="size-6 rounded-full border" style={{ backgroundColor: c }} />
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
      <div className="rounded-lg bg-[#16A34A]/5 p-4 text-sm">
        <p className="font-medium text-[#16A34A]">You're all set!</p>
        <p className="mt-1 text-muted-foreground">
          Click "Save & launch" to create your Brand Profile. NativPost will start generating content based on this profile.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// REUSABLE FORM COMPONENTS
// ============================================================

function FormField({ label, placeholder, value, onChange, type = 'text', required }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} className="w-full rounded-lg border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30" />
    </div>
  );
}

function FormTextarea({ label, placeholder, value, onChange, rows = 3 }: { label: string; placeholder: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full resize-none rounded-lg border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30" />
    </div>
  );
}

function ToneSlider({ label, leftLabel, rightLabel, value, onChange }: { label: string; leftLabel: string; rightLabel: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs font-medium text-muted-foreground">{value}/10</span>
      </div>
      <input type="range" min={1} max={10} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[#16A34A]" />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

function TagInput({ label, placeholder, helpText, tags, onChange }: { label: string; placeholder: string; helpText?: string; tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      if (!tags.includes(input.trim())) onChange([...tags, input.trim()]);
      setInput('');
    }
  };
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {helpText && <p className="mb-2 text-xs text-muted-foreground">{helpText}</p>}
      <div className="flex min-h-[42px] flex-wrap gap-1.5 rounded-lg border bg-background p-2 focus-within:border-[#16A34A] focus-within:ring-2 focus-within:ring-[#16A34A]/30">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium">
            {tag}
            <button onClick={() => onChange(tags.filter((t) => t !== tag))} className="ml-0.5 text-muted-foreground hover:text-foreground">×</button>
          </span>
        ))}
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={tags.length === 0 ? placeholder : ''} className="min-w-[120px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground" />
      </div>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-8 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent font-mono text-sm uppercase outline-none" maxLength={7} />
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
  if (!value) return null;
  return (
    <div className="text-sm">
      {label && <span className="font-medium">{label}: </span>}
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

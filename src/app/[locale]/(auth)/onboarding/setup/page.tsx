'use client';

import { useAuth, useOrganization } from '@clerk/nextjs';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type BrandContextMode = 'website' | 'description';

type WizardData = {
  brandName: string;
  logoUrl: string;
  contextMode: BrandContextMode;
  websiteUrl: string;
  websiteFieldsFound: string[] | null;
  websiteError: string | null;
  extracted: Record<string, unknown> | null;
  descProduct: string;
  descAudience: string;
  descProblem: string;
  descBenefits: string;
  descTone: string;
  descAvoid: string;
  teamSize: string;
  monthlyRevenue: string;
  role: string;
  intent: string;
  expectations: string[];
  referralSources: string[];
};

const EMPTY_DATA: WizardData = {
  brandName: '',
  logoUrl: '',
  contextMode: 'website',
  websiteUrl: '',
  websiteFieldsFound: null,
  websiteError: null,
  extracted: null,
  descProduct: '',
  descAudience: '',
  descProblem: '',
  descBenefits: '',
  descTone: '',
  descAvoid: '',
  teamSize: '',
  monthlyRevenue: '',
  role: '',
  intent: '',
  expectations: [],
  referralSources: [],
};

const STEPS = [
  { id: 'logo', label: 'Logo' },
  { id: 'brand_context', label: 'About your brand' },
  { id: 'business_context', label: 'Your business' },
  { id: 'role', label: 'Your role' },
  { id: 'intent', label: 'Your goals' },
  { id: 'referral', label: 'Referral source' },
  { id: 'next_steps', label: 'Done' },
] as const;

const TEAM_SIZE_OPTIONS = ['Just me', '2–5', '6–10', '11–20', '21–50', '50+'];
const REVENUE_OPTIONS = ['Pre-revenue', '$1 – $1,000', '$1,000 – $10k', '$10k – $50k', '$50k – $500k', '$500k+'];
const ROLE_OPTIONS = ['Founder', 'Marketing manager', 'Social media manager', 'Agency owner', 'Freelancer', 'Content creator', 'Other'];
const INTENT_OPTIONS = ['I need this now', 'Planning ahead for soon', 'Just exploring'];
const EXPECTATION_OPTIONS = [
  'Save time on content creation',
  'Get more engagement on social',
  'Drive traffic to my site',
  'Generate revenue',
  'Look more professional online',
  'Other',
];
const REFERRAL_OPTIONS = ['X (Twitter)', 'LinkedIn', 'Instagram', 'TikTok', 'YouTube', 'Google search', 'Friend or referral', 'Other'];

// -----------------------------------------------------------
// DRAFT PERSISTENCE — survives an accidental refresh mid-wizard
// -----------------------------------------------------------
function draftKey(orgId: string) {
  return `nativpost:onboarding-setup-draft:${orgId}`;
}

function loadDraft(orgId: string): WizardData | null {
  try {
    const raw = localStorage.getItem(draftKey(orgId));
    return raw ? { ...EMPTY_DATA, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

function saveDraft(orgId: string, data: WizardData) {
  try {
    localStorage.setItem(draftKey(orgId), JSON.stringify(data));
  } catch {
    // localStorage unavailable — non-fatal, just means no refresh recovery
  }
}

function clearDraft(orgId: string) {
  try {
    localStorage.removeItem(draftKey(orgId));
  } catch {
    // ignore
  }
}

// -----------------------------------------------------------
// SHARED PIECES — no decorative icons, text only
// -----------------------------------------------------------
function ChoiceGrid({
  options,
  selected,
  onSelect,
  multi,
  columns = 2,
}: {
  options: string[];
  selected: string | string[];
  onSelect: (value: string) => void;
  multi?: boolean;
  columns?: 2 | 3;
}) {
  const isSelected = (opt: string) =>
    multi ? (selected as string[]).includes(opt) : selected === opt;

  return (
    <div className={`grid gap-2.5 ${columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onSelect(opt)}
          className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors ${
            isSelected(opt)
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border hover:bg-muted/50'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function WizardShell({
  stepIndex,
  children,
  onBack,
  showBack,
}: {
  stepIndex: number;
  children: React.ReactNode;
  onBack: () => void;
  showBack: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex justify-center">
          <Image
            src="/assets/images/shared/main-logo-dark.svg"
            alt="NativPost"
            width={140}
            height={32}
            priority
          />
        </div>

        <div className="rounded-2xl border bg-card p-7 shadow-sm">
          {children}
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5">
          {STEPS.map((step, i) => (
            <div
              key={step.id}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex ? 'w-6 bg-primary' : i < stepIndex ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-muted-foreground/20'
              }`}
            />
          ))}
        </div>

        {showBack && (
          <button
            type="button"
            onClick={onBack}
            className="mx-auto mt-4 block text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

// Helper to construct normalized clean submission URLs
function getNormalizedUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function ContinueButton({
  onClick,
  disabled,
  isLoading,
  label = 'Continue',
}: {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isLoading && <Loader2 className="size-4 animate-spin" />}
      {isLoading ? 'Saving...' : label}
    </button>
  );
}

// -----------------------------------------------------------
// LOGO UPLOADER — same Uploadcare approach as the Brand Profile
// wizard, kept as its own small copy here rather than shared, so
// neither file depends on the other changing.
// -----------------------------------------------------------
function LogoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const publicKey = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || '';

  const handleFile = async (file: File | undefined) => {
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
      onChange(`https://9c0v643oty.ucarecd.net/${data.file}/`);
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors hover:bg-muted/40"
      >
        {value
          ? (
              <Image src={value} alt="Logo preview" width={64} height={64} unoptimized className="size-16 rounded-lg object-contain" />
            )
          : (
              <span className="text-sm font-medium text-muted-foreground">
                {isUploading ? 'Uploading...' : 'Upload'}
              </span>
            )}
        <span className="text-xs text-muted-foreground">
          {value ? 'Click to replace' : 'PNG, JPG, SVG, or WebP — up to 2MB'}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
      />
      {uploadError && <p className="mt-2 text-xs text-destructive">{uploadError}</p>}
    </div>
  );
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function OnboardingSetupPage() {
  const router = useRouter();

  // orgId comes from the session claim (same source middleware uses),
  // not the `organization` object — that object is known to lag a tick
  // behind right after Clerk creates a new org, which previously caused
  // this page to wrongly bounce back to org-selection.
  const { orgId, isLoaded: authLoaded } = useAuth();
  const { organization } = useOrganization();

  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<WizardData>(EMPTY_DATA);
  const [isCheckingGate, setIsCheckingGate] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const update = (updates: Partial<WizardData>) => {
    setData((prev) => {
      const next = { ...prev, ...updates };
      if (orgId) {
        saveDraft(orgId, next);
      }
      return next;
    });
  };

  // ── Re-entry guard ──────────────────────────────────────────
  // Runs once, right after a new org is created. If it's already been
  // completed (bookmarked URL, back button), skip straight to the
  // dashboard instead of replaying it.
  useEffect(() => {
    if (!authLoaded) {
      return;
    }

    if (!orgId) {
      router.replace('/onboarding/organization-selection');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/onboarding-progress?step=post_signup');
        const json = await res.json();
        const alreadyDone = (json.steps || []).some((s: any) => s.completed);

        if (cancelled) {
          return;
        }

        if (alreadyDone) {
          router.replace('/dashboard');
          return;
        }

        const draft = loadDraft(orgId);
        setData({
          ...EMPTY_DATA,
          ...(draft || {}),
        });
        setIsCheckingGate(false);
      } catch {
        // If the gate check itself fails, fail open rather than trap
        // a real new user on a spinner forever.
        if (!cancelled) {
          setIsCheckingGate(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, orgId]);

  const goNext = () => setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
  const goBack = () => setStepIndex(i => Math.max(i - 1, 0));

  const toggleInList = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value];

  // ── Website analysis ────────────────────────────────────────
  const handleAnalyzeWebsite = async () => {
    const url = getNormalizedUrl(data.websiteUrl);
    if (!url || url === 'https://') {
      update({ websiteError: 'Enter a website URL first.' });
      return;
    }

    setIsAnalyzing(true);
    update({ websiteError: null, websiteFieldsFound: null });

    try {
      const res = await fetch('/api/brand-profile/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();

      if (!res.ok) {
        update({ websiteError: json.error || 'Could not read that site. Try the description option instead.' });
        return;
      }

      update({
        extracted: json.profile,
        websiteFieldsFound: json.fieldsFound || [],
      });
    } catch {
      update({ websiteError: 'Something went wrong reaching the analysis service. Try again, or use the description option.' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Final submit ─────────────────────────────────────────────
  const handleFinish = async () => {
    if (!orgId) {
      return;
    }

    setIsFinishing(true);
    setFinishError(null);

    try {
      const growthStage = ['Just me', '2–5'].includes(data.teamSize) && ['Pre-revenue', '$1 – $1,000'].includes(data.monthlyRevenue)
        ? 'early'
        : ['50+', '21–50'].includes(data.teamSize) || data.monthlyRevenue === '$500k+'
          ? 'established'
          : 'growing';

      const brandName = data.brandName || organization?.name || '';
      const extracted: Record<string, unknown> = data.extracted || {};

      const brandProfilePayload = data.contextMode === 'website'
        ? {
            brandName,
            logoUrl: data.logoUrl,
            websiteUrl: getNormalizedUrl(data.websiteUrl),
            industry: extracted.industry,
            targetAudience: extracted.targetAudience,
            companyDescription: extracted.companyDescription,
            communicationStyle: extracted.communicationStyle,
            vocabulary: extracted.vocabulary,
            contentExamples: extracted.contentExamples,
            mission: extracted.mission,
            values: extracted.values,
            productsServices: extracted.productsServices,
            keyDifferentiators: extracted.keyDifferentiators,
            toneFormality: extracted.toneFormality,
            toneHumor: extracted.toneHumor,
            toneEnergy: extracted.toneEnergy,
            growthStage,
          }
        : {
            brandName,
            logoUrl: data.logoUrl,
            companyDescription: [data.descProduct, data.descProblem, data.descBenefits].filter(Boolean).join(' '),
            targetAudience: data.descAudience,
            communicationStyle: data.descTone,
            antiPatterns: data.descAvoid ? [data.descAvoid] : [],
            growthStage,
          };

      const profileRes = await fetch('/api/brand-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandProfilePayload),
      });

      if (!profileRes.ok) {
        throw new Error('Failed to save brand profile');
      }

      await fetch('/api/onboarding-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'post_signup_survey',
          completed: true,
          data: {
            teamSize: data.teamSize,
            monthlyRevenue: data.monthlyRevenue,
            role: data.role,
            intent: data.intent,
            expectations: data.expectations,
            referralSources: data.referralSources,
          },
        }),
      });

      await fetch('/api/onboarding-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'post_signup', completed: true, data: {} }),
      });

      clearDraft(orgId);
      router.push('/dashboard');
    } catch {
      setFinishError('Something went wrong saving your setup. You can try again, or skip to the dashboard and finish your brand profile there.');
      setIsFinishing(false);
    }
  };

  if (isCheckingGate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentStep = STEPS[stepIndex]!.id;
  const minDescriptionChars = 40;
  const descriptionChars = [data.descProduct, data.descAudience, data.descProblem, data.descBenefits, data.descTone, data.descAvoid]
    .join(' ').trim().length;

  return (
    <WizardShell stepIndex={stepIndex} onBack={goBack} showBack={stepIndex > 0 && stepIndex < STEPS.length - 1}>

      {/* ── Step: Logo ── */}
      {currentStep === 'logo' && (
        <>
          <StepHeading title="Add a logo" subtitle="Optional — you can add this later in Brand Profile." />
          <LogoUploader value={data.logoUrl} onChange={v => update({ logoUrl: v })} />
          <div className="mt-7">
            <ContinueButton onClick={goNext} />
          </div>
        </>
      )}

      {/* ── Step: Brand context (website or description) ── */}
      {currentStep === 'brand_context' && (
        <>
          <StepHeading title="Tell us about your brand" subtitle="This is what we use to generate content for you." />

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => update({ contextMode: 'website' })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                data.contextMode === 'website' ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted/50'
              }`}
            >
              Website
            </button>
            <button
              type="button"
              onClick={() => update({ contextMode: 'description' })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                data.contextMode === 'description' ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted/50'
              }`}
            >
              Describe it instead
            </button>
          </div>

          {data.contextMode === 'website'
            ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {/* Visual prefix layout wrapper matching image_8237f8.png */}
                    <div className="flex flex-1 items-center rounded-lg border bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary overflow-hidden transition-all">
                      <span className="pl-3 text-sm text-muted-foreground select-none pointer-events-none">
                        https://
                      </span>
                      <input
                        type="text"
                        value={data.websiteUrl}
                        onChange={e => {
                          // Automatically strip matching web protocols if explicitly typed/pasted
                          const cleanVal = e.target.value.replace(/^https?:\/\//i, '').trim();
                          update({ websiteUrl: cleanVal });
                        }}
                        placeholder="nativpost.com"
                        disabled={isAnalyzing}
                        className="w-full bg-transparent pl-1 pr-3 py-2.5 text-sm outline-none disabled:opacity-60"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAnalyzeWebsite}
                      disabled={isAnalyzing}
                      className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors disabled:opacity-60"
                    >
                      {isAnalyzing ? 'Reading...' : 'Analyze'}
                    </button>
                  </div>
                  {data.websiteError && <p className="text-xs text-destructive">{data.websiteError}</p>}
                  {data.websiteFieldsFound && (
                    <p className="text-xs text-muted-foreground">
                      Picked up
                      {' '}
                      {data.websiteFieldsFound.length}
                      {' '}
                      details from your site. You can edit everything later in Brand Profile.
                    </p>
                  )}
                </div>
              )
            : (
                <div className="space-y-3">
                  {([
                    ['descProduct', 'What do you sell or offer?'],
                    ['descAudience', 'Who is it for?'],
                    ['descProblem', 'What problem does it solve?'],
                    ['descBenefits', 'Key benefits, in your own words'],
                    ['descTone', 'How should your content sound? (e.g. direct, playful, formal)'],
                    ['descAvoid', 'Anything we should avoid saying or doing?'],
                  ] as const).map(([field, placeholder]) => (
                    <input
                      key={field}
                      type="text"
                      value={data[field]}
                      onChange={e => update({ [field]: e.target.value } as Partial<WizardData>)}
                      placeholder={placeholder}
                      className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
                    />
                  ))}
                  <p className="text-right text-xs text-muted-foreground">
                    {descriptionChars < minDescriptionChars
                      ? `${minDescriptionChars - descriptionChars} more characters needed`
                      : 'Looks good'}
                  </p>
                </div>
              )}

          <div className="mt-7">
            <ContinueButton
              onClick={goNext}
              disabled={
                data.contextMode === 'website'
                  ? !data.websiteFieldsFound
                  : descriptionChars < minDescriptionChars
              }
            />
            {data.contextMode === 'website' && !data.websiteFieldsFound && (
              <button
                type="button"
                onClick={() => update({ contextMode: 'description' })}
                className="mt-3 w-full text-center text-xs text-muted-foreground underline"
              >
                Skip analysis and describe it instead
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Step: Business context ── */}
      {currentStep === 'business_context' && (
        <>
          <StepHeading title="Tell us about your business" />
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">Team size</p>
              <ChoiceGrid options={TEAM_SIZE_OPTIONS} selected={data.teamSize} onSelect={v => update({ teamSize: v })} columns={3} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Monthly revenue</p>
              <ChoiceGrid options={REVENUE_OPTIONS} selected={data.monthlyRevenue} onSelect={v => update({ monthlyRevenue: v })} columns={3} />
            </div>
          </div>
          <div className="mt-7">
            <ContinueButton onClick={goNext} disabled={!data.teamSize || !data.monthlyRevenue} />
          </div>
        </>
      )}

      {/* ── Step: Role ── */}
      {currentStep === 'role' && (
        <>
          <StepHeading title="What's your role?" />
          <ChoiceGrid options={ROLE_OPTIONS} selected={data.role} onSelect={v => update({ role: v })} />
          <div className="mt-7">
            <ContinueButton onClick={goNext} disabled={!data.role} />
          </div>
        </>
      )}

      {/* ── Step: Intent + expectations ── */}
      {currentStep === 'intent' && (
        <>
          <StepHeading title="Why did you sign up?" />
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">Select one</p>
              <ChoiceGrid options={INTENT_OPTIONS} selected={data.intent} onSelect={v => update({ intent: v })} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">What are you hoping to get out of NativPost? Select all that apply.</p>
              <ChoiceGrid
                options={EXPECTATION_OPTIONS}
                selected={data.expectations}
                onSelect={v => update({ expectations: toggleInList(data.expectations, v) })}
                multi
              />
            </div>
          </div>
          <div className="mt-7">
            <ContinueButton onClick={goNext} disabled={!data.intent} />
          </div>
        </>
      )}

      {/* ── Step: Referral ── */}
      {currentStep === 'referral' && (
        <>
          <StepHeading title="How did you hear about us?" subtitle="Select all that apply." />
          <ChoiceGrid
            options={REFERRAL_OPTIONS}
            selected={data.referralSources}
            onSelect={v => update({ referralSources: toggleInList(data.referralSources, v) })}
            multi
            columns={3}
          />
          <div className="mt-7">
            <ContinueButton onClick={goNext} disabled={data.referralSources.length === 0} />
          </div>
        </>
      )}

      {/* ── Step: Done ── */}
      {currentStep === 'next_steps' && (
        <>
          <StepHeading title="You're set up" subtitle="Your brand profile is saved. Here's what happens from here." />
          <ol className="space-y-2 text-sm">
            <li className="border-b pb-2"><span className="font-medium">1. Generate</span> — give us a topic, get three takes on it.</li>
            <li className="border-b pb-2"><span className="font-medium">2. Quality filter</span> — generic-sounding drafts get rewritten before you see them.</li>
            <li><span className="font-medium">3. Review and publish</span> — approve what you like, it goes out on schedule.</li>
          </ol>
          {finishError && <p className="mt-4 text-xs text-destructive">{finishError}</p>}
          <div className="mt-7">
            <ContinueButton onClick={handleFinish} isLoading={isFinishing} label="Go to your dashboard" />
          </div>
        </>
      )}
    </WizardShell>
  );
}
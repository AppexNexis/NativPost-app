'use client';

/**
 * OnboardingSetupPage
 *
 * New-user wizard. Middleware owns the "already done" gate now (reads
 * Clerk sessionClaims.publicMetadata.onboardedOrgs), so this file no
 * longer polls /api/onboarding-progress on mount. Draft persistence in
 * localStorage still survives accidental refreshes mid-wizard.
 *
 * On finish, calls POST /api/onboarding-progress/complete which:
 *   - marks post_signup completed in the DB
 *   - writes onboardedOrgs[orgId] to Clerk user publicMetadata
 *   - sets a signed np_onb_<orgId> cookie
 * Then reloads Clerk user state so the fresh session claim is available
 * before the /dashboard navigation.
 */

import { useAuth, useOrganization, useUser } from '@clerk/nextjs';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ContentAnglesPreview, type ContentAngleDraft } from '@/components/onboarding/ContentAnglesPreview';
import { OnboardingLogoUploader } from '@/components/onboarding/OnboardingLogoUploader';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { ChoiceGrid, ContinueButton, StepHeading } from '@/components/onboarding/StepShell';
import { Input } from '@/components/ui/input';

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
  angles: ContentAngleDraft[];
  selectedAngles: string[];
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
  angles: [],
  selectedAngles: [],
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

const TEAM_SIZE_OPTIONS = ['Just me', '2 to 5', '6 to 10', '11 to 20', '21 to 50', '50+'];
const REVENUE_OPTIONS = ['Pre-revenue', '$1 to $1,000', '$1,000 to $10k', '$10k to $50k', '$50k to $500k', '$500k+'];
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
// DRAFT PERSISTENCE (survives an accidental refresh mid-wizard)
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
    // localStorage unavailable, non-fatal.
  }
}

function clearDraft(orgId: string) {
  try {
    localStorage.removeItem(draftKey(orgId));
  } catch {
    // ignore
  }
}

function getNormalizedUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function inferGrowthStage(teamSize: string, revenue: string): 'early' | 'growing' | 'established' {
  const smallTeam = teamSize === 'Just me' || teamSize === '2 to 5';
  const earlyRevenue = revenue === 'Pre-revenue' || revenue === '$1 to $1,000';
  const largeTeam = teamSize === '50+' || teamSize === '21 to 50';
  const highRevenue = revenue === '$500k+';

  if (smallTeam && earlyRevenue) return 'early';
  if (largeTeam || highRevenue) return 'established';
  return 'growing';
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function OnboardingSetupPage() {
  const router = useRouter();
  const { orgId, isLoaded: authLoaded } = useAuth();
  const { organization } = useOrganization();
  const { user } = useUser();

  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<WizardData>(EMPTY_DATA);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const update = (updates: Partial<WizardData>) => {
    setData((prev) => {
      const next = { ...prev, ...updates };
      if (orgId) saveDraft(orgId, next);
      return next;
    });
  };

  useEffect(() => {
    if (!authLoaded) return;
    if (!orgId) {
      router.replace('/onboarding/organization-selection');
      return;
    }
    setData({ ...EMPTY_DATA, ...(loadDraft(orgId) || {}) });
    setIsDraftLoaded(true);
  }, [authLoaded, orgId, router]);

  const goNext = () => setStepIndex(i => Math.min(i + 1, STEPS.length - 1));
  const goBack = () => setStepIndex(i => Math.max(i - 1, 0));
  const toggleInList = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value];

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
      const angles: ContentAngleDraft[] = Array.isArray(json.angles) ? json.angles : [];
      update({
        extracted: json.profile,
        websiteFieldsFound: json.fieldsFound || [],
        angles,
        selectedAngles: angles.map(a => a.name),
      });
    } catch {
      update({ websiteError: 'Something went wrong reaching the analysis service. Try again, or use the description option.' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const persistAngles = async () => {
    if (!data.angles.length || !data.selectedAngles.length) return;
    const selected = data.angles.filter(a => data.selectedAngles.includes(a.name));
    await Promise.all(
      selected.map(angle =>
        fetch('/api/content-angles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: angle.name,
            description: angle.description,
            targetAudience: angle.targetAudience,
          }),
        }).catch(() => null),
      ),
    );
  };

  const handleFinish = async () => {
    if (!orgId) return;
    setIsFinishing(true);
    setFinishError(null);

    try {
      const growthStage = inferGrowthStage(data.teamSize, data.monthlyRevenue);
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
      if (!profileRes.ok) throw new Error('Failed to save brand profile');

      await persistAngles();

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

      const completeRes = await fetch('/api/onboarding-progress/complete', { method: 'POST' });
      if (!completeRes.ok) throw new Error('Failed to mark onboarding complete');

      // Force a fresh Clerk session token so the middleware sees the new
      // publicMetadata.onboardedOrgs entry on the very next request.
      try {
        await user?.reload();
      } catch {
        // Non-fatal, cookie fallback still lets user through.
      }

      clearDraft(orgId);
      router.replace('/dashboard');
    } catch {
      setFinishError('Something went wrong saving your setup. You can try again, or skip to the dashboard and finish your brand profile there.');
      setIsFinishing(false);
    }
  };

  if (!isDraftLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentStep = STEPS[stepIndex]!.id;
  const minDescriptionChars = 40;
  const descriptionChars = [data.descProduct, data.descAudience, data.descProblem, data.descBenefits, data.descTone, data.descAvoid]
    .join(' ').trim().length;

  return (
    <OnboardingShell
      totalSteps={STEPS.length}
      stepIndex={stepIndex}
      onBack={goBack}
      showBack={stepIndex > 0 && stepIndex < STEPS.length - 1}
    >
      {currentStep === 'logo' && (
        <>
          <StepHeading title="Add a logo" subtitle="Optional. You can add this later in Brand Profile." />
          <OnboardingLogoUploader value={data.logoUrl} onChange={v => update({ logoUrl: v })} />
          <div className="mt-7">
            <ContinueButton onClick={goNext} />
          </div>
        </>
      )}

      {currentStep === 'brand_context' && (
        <>
          <StepHeading title="Tell us about your brand" subtitle="This is what we use to generate content for you." />
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => update({ contextMode: 'website' })}
              className={`flex-1 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                data.contextMode === 'website'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-foreground hover:bg-muted/40'
              }`}
            >
              Website
            </button>
            <button
              type="button"
              onClick={() => update({ contextMode: 'description' })}
              className={`flex-1 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                data.contextMode === 'description'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-foreground hover:bg-muted/40'
              }`}
            >
              Describe it instead
            </button>
          </div>

          {data.contextMode === 'website'
            ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex flex-1 items-center overflow-hidden rounded-full border border-input bg-background transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                      <span className="select-none pointer-events-none pl-4 text-sm text-muted-foreground">
                        https://
                      </span>
                      <Input
                        type="text"
                        value={data.websiteUrl}
                        onChange={(e) => {
                          const cleanVal = e.target.value.replace(/^https?:\/\//i, '').trim();
                          update({ websiteUrl: cleanVal });
                        }}
                        placeholder="nativpost.com"
                        disabled={isAnalyzing}
                        className="border-0 bg-transparent pl-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAnalyzeWebsite}
                      disabled={isAnalyzing}
                      className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
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
                      details from your site and drafted
                      {' '}
                      {data.angles.length}
                      {' '}
                      content angles. You can review them at the last step.
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
                    <Input
                      key={field}
                      type="text"
                      value={data[field]}
                      onChange={e => update({ [field]: e.target.value } as Partial<WizardData>)}
                      placeholder={placeholder}
                    />
                  ))}
                  <p className="text-right text-xs text-muted-foreground">
                    {descriptionChars < minDescriptionChars
                      ? `${minDescriptionChars - descriptionChars} more characters needed`
                      : 'Looks good'}
                  </p>
                </div>
              )}

          <div className="mt-7 space-y-3">
            <ContinueButton
              onClick={goNext}
              disabled={data.contextMode === 'website'
                ? !data.websiteFieldsFound
                : descriptionChars < minDescriptionChars}
            />
            {data.contextMode === 'website' && !data.websiteFieldsFound && (
              <button
                type="button"
                onClick={() => update({ contextMode: 'description' })}
                className="block w-full text-center text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Skip analysis and describe it instead
              </button>
            )}
          </div>
        </>
      )}

      {currentStep === 'business_context' && (
        <>
          <StepHeading title="Tell us about your business" />
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Team size</p>
              <ChoiceGrid options={TEAM_SIZE_OPTIONS} selected={data.teamSize} onSelect={v => update({ teamSize: v })} columns={3} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Monthly revenue</p>
              <ChoiceGrid options={REVENUE_OPTIONS} selected={data.monthlyRevenue} onSelect={v => update({ monthlyRevenue: v })} columns={3} />
            </div>
          </div>
          <div className="mt-7">
            <ContinueButton onClick={goNext} disabled={!data.teamSize || !data.monthlyRevenue} />
          </div>
        </>
      )}

      {currentStep === 'role' && (
        <>
          <StepHeading title="What's your role?" />
          <ChoiceGrid options={ROLE_OPTIONS} selected={data.role} onSelect={v => update({ role: v })} />
          <div className="mt-7">
            <ContinueButton onClick={goNext} disabled={!data.role} />
          </div>
        </>
      )}

      {currentStep === 'intent' && (
        <>
          <StepHeading title="Why did you sign up?" />
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Select one</p>
              <ChoiceGrid options={INTENT_OPTIONS} selected={data.intent} onSelect={v => update({ intent: v })} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">
                What are you hoping to get out of NativPost? Select all that apply.
              </p>
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

      {currentStep === 'next_steps' && (
        <>
          <StepHeading title="You're set up" subtitle="Your brand profile is saved. Here's what happens from here." />
          <ol className="mb-6 space-y-2 text-sm">
            <li className="border-b border-border pb-2">
              <span className="font-medium text-foreground">1. Generate.</span>
              {' '}
              <span className="text-muted-foreground">Give us a topic, get three takes on it.</span>
            </li>
            <li className="border-b border-border pb-2">
              <span className="font-medium text-foreground">2. Quality filter.</span>
              {' '}
              <span className="text-muted-foreground">Generic-sounding drafts get rewritten before you see them.</span>
            </li>
            <li>
              <span className="font-medium text-foreground">3. Review and publish.</span>
              {' '}
              <span className="text-muted-foreground">Approve what you like, it goes out on schedule.</span>
            </li>
          </ol>

          <ContentAnglesPreview
            angles={data.angles}
            selected={data.selectedAngles}
            onToggle={name => update({
              selectedAngles: data.selectedAngles.includes(name)
                ? data.selectedAngles.filter(n => n !== name)
                : [...data.selectedAngles, name],
            })}
          />

          {finishError && <p className="mt-4 text-xs text-destructive">{finishError}</p>}
          <div className="mt-7">
            <ContinueButton onClick={handleFinish} isLoading={isFinishing} label="Go to your dashboard" />
          </div>
        </>
      )}
    </OnboardingShell>
  );
}

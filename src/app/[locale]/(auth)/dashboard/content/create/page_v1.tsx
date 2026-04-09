'use client';

import {
  AlignLeft,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  RefreshCw,
  Sparkles,
  Video,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  PLATFORMS,
} from '@/components/icons/PlatformIcons';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type Variant = {
  id: string;
  caption: string;
  hashtags: string[];
  antiSlopScore: number | null;
  qualityFlags: string[];
  variantNumber: number;
  platformSpecific: Record<string, string>;
  enrichmentApplied?: string[];
};

type ConnectedAccount = {
  id: string;
  platform: string;
  platformUsername: string | null;
  isActive: boolean;
};

type Enrichment = {
  cta_url: string;
  cta_label: string;
  reference_links: string[];
  contact_info: string;
  promo_code: string;
  event_details: string;
  custom_mentions: string[];
};

const CONTENT_TYPES = [
  { id: 'text_only', label: 'Text Post', description: 'Text-only post', icon: AlignLeft },
  { id: 'single_image', label: 'Image Post', description: 'Single image with caption', icon: ImageIcon },
  { id: 'carousel', label: 'Carousel', description: 'Multi-image carousel', icon: Layers },
  { id: 'reel', label: 'Video Post', description: 'Reel, Short, or video', icon: Video },
];

const CONTENT_MODES = [
  {
    id: 'normal',
    label: 'Normal',
    description: 'Balanced, everyday tone for general audiences',
    color: 'border-zinc-300 bg-zinc-50 text-zinc-700',
    activeColor: 'border-zinc-500 bg-zinc-100 text-zinc-900 ring-2 ring-zinc-300',
  },
  {
    id: 'concise',
    label: 'Concise',
    description: 'Stripped down to the most impactful form',
    color: 'border-blue-200 bg-blue-50/50 text-blue-700',
    activeColor: 'border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-300',
  },
  {
    id: 'controversial',
    label: 'Controversial',
    description: 'Takes a position, sparks debate, drives engagement',
    color: 'border-orange-200 bg-orange-50/50 text-orange-700',
    activeColor: 'border-orange-500 bg-orange-50 text-orange-900 ring-2 ring-orange-300',
  },
];

const EMPTY_ENRICHMENT: Enrichment = {
  cta_url: '',
  cta_label: '',
  reference_links: [],
  contact_info: '',
  promo_code: '',
  event_details: '',
  custom_mentions: [],
};

// -----------------------------------------------------------
// CREATE CONTENT PAGE
// -----------------------------------------------------------
export default function ContentCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scheduledDate = searchParams.get('scheduledDate') || '';

  const [step, setStep] = useState<'type' | 'configure' | 'review'>('type');
  const [contentType, setContentType] = useState('');
  const [topic, setTopic] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  // v2: Content mode and enrichment
  const [contentMode, setContentMode] = useState('normal');
  const [showEnrichment, setShowEnrichment] = useState(false);
  const [enrichment, setEnrichment] = useState<Enrichment>(EMPTY_ENRICHMENT);
  const [refLinkInput, setRefLinkInput] = useState('');
  const [mentionInput, setMentionInput] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/social-accounts');
        if (res.ok) {
          const data = await res.json();
          setConnectedAccounts(data.accounts || []);
        }
      } catch (err) {
        console.error('Failed to load accounts:', err);
      }
    }
    load();
  }, []);

  const connectedPlatformIds = connectedAccounts
    .filter(a => a.isActive)
    .map(a => a.platform);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id],
    );
  };

  const selectContentType = (id: string) => {
    setContentType(id);
    setStep('configure');
  };

  // Enrichment helpers
  const hasEnrichment = () => {
    return (
      enrichment.cta_url
      || enrichment.contact_info
      || enrichment.promo_code
      || enrichment.event_details
      || enrichment.reference_links.length > 0
      || enrichment.custom_mentions.length > 0
    );
  };

  const addRefLink = () => {
    const url = refLinkInput.trim();
    if (url && !enrichment.reference_links.includes(url)) {
      setEnrichment(prev => ({
        ...prev,
        reference_links: [...prev.reference_links, url],
      }));
      setRefLinkInput('');
    }
  };

  const removeRefLink = (url: string) => {
    setEnrichment(prev => ({
      ...prev,
      reference_links: prev.reference_links.filter(l => l !== url),
    }));
  };

  const addMention = () => {
    let handle = mentionInput.trim();
    if (handle && !handle.startsWith('@')) {
      handle = `@${handle}`;
    }
    if (handle && !enrichment.custom_mentions.includes(handle)) {
      setEnrichment(prev => ({
        ...prev,
        custom_mentions: [...prev.custom_mentions, handle],
      }));
      setMentionInput('');
    }
  };

  const removeMention = (handle: string) => {
    setEnrichment(prev => ({
      ...prev,
      custom_mentions: prev.custom_mentions.filter(m => m !== handle),
    }));
  };

  const handleGenerate = async () => {
    if (selectedPlatforms.length === 0) {
      setError('Select at least one platform.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setVariants([]);
    setSelectedVariant(null);

    try {
      const payload: Record<string, unknown> = {
        topic: topic || undefined,
        contentType,
        targetPlatforms: selectedPlatforms,
        numVariants: 3,
        contentMode,
      };

      // Only send enrichment if it has data
      if (hasEnrichment()) {
        payload.enrichment = enrichment;
      }

      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Generation failed. Please try again.');
        return;
      }

      const data = await res.json();
      setVariants(
        data.variants.map((v: Record<string, unknown>) => ({
          id: v.id as string,
          caption: v.caption as string,
          hashtags: (v.hashtags as string[]) || [],
          antiSlopScore: v.antiSlopScore as number | null,
          qualityFlags: (v.qualityFlags as string[]) || [],
          variantNumber: v.variantNumber as number,
          platformSpecific: (v.platformSpecific as Record<string, string>) || {},
          enrichmentApplied: (v.enrichmentApplied as string[]) || [],
        })),
      );
      setStep('review');
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedVariant) {
      return;
    }
    setIsApproving(true);
    try {
      await fetch(`/api/content/${selectedVariant}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', isSelectedVariant: true }),
      });

      if (scheduledDate) {
        router.push(`/dashboard/content/${selectedVariant}?autoSchedule=${scheduledDate}`);
      } else {
        router.push('/dashboard/posts');
      }
    } catch {
      setError('Failed to approve.');
      setIsApproving(false);
    }
  };

  // Quality score display helper
  const scoreLabel = (score: number) => {
    if (score >= 0.9) {
      return { text: 'Excellent', color: 'bg-emerald-50 text-emerald-700' };
    }
    if (score >= 0.8) {
      return { text: 'Great', color: 'bg-green-50 text-green-700' };
    }
    if (score >= 0.7) {
      return { text: 'Good', color: 'bg-yellow-50 text-yellow-700' };
    }
    if (score >= 0.5) {
      return { text: 'Needs work', color: 'bg-orange-50 text-orange-700' };
    }
    return { text: 'Poor', color: 'bg-red-50 text-red-700' };
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Create a new post</h1>
          {step !== 'type' && (
            <p className="mt-1 text-sm text-muted-foreground">
              {step === 'configure' ? 'Configure your post details' : 'Review generated variants'}
            </p>
          )}
        </div>
        {step !== 'type' && (
          <button
            type="button"
            onClick={() => setStep(step === 'review' ? 'configure' : 'type')}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
            Back
          </button>
        )}
      </div>

      {/* Calendar context banner */}
      {scheduledDate && (
        <div className="mb-5 flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div className="size-1.5 rounded-full bg-violet-500" />
          <p className="text-sm text-muted-foreground">
            This post will be scheduled for
            {' '}
            <span className="font-medium text-foreground">
              {new Date(`${scheduledDate}T12:00:00`).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
            .
          </p>
        </div>
      )}

      {/* STEP 1: Choose content type */}
      {step === 'type' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CONTENT_TYPES.map((type) => {
              const Icon = type.icon;
              const supported = type.id === 'text_only'
                ? ['facebook', 'twitter', 'linkedin']
                : type.id === 'reel'
                  ? ['instagram', 'tiktok', 'facebook', 'twitter', 'linkedin']
                  : ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok'];

              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => selectContentType(type.id)}
                  className="group flex flex-col items-center rounded-xl border-2 border-dashed border-border/60 bg-card p-8 text-center transition-all hover:border-primary/40 hover:bg-primary/5"
                >
                  <Icon className="mb-4 size-10 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" strokeWidth={1.2} />
                  <h3 className="text-sm font-semibold">{type.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{type.description}</p>
                  <div className="mt-4 flex items-center gap-1.5">
                    {supported.map((p) => {
                      const platform = PLATFORMS.find(pl => pl.id === p);
                      if (!platform) {
                        return null;
                      }
                      const PIcon = platform.icon;
                      return <PIcon key={p} className="size-4 text-muted-foreground/50" />;
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          {connectedAccounts.length === 0 && (
            <div className="mt-6 flex items-center justify-between rounded-xl bg-muted/50 px-5 py-4">
              <p className="text-sm text-muted-foreground">
                Connect your social media accounts to publish content.
              </p>
              <Link
                href="/dashboard/connections"
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90"
              >
                Connect accounts
              </Link>
            </div>
          )}
        </>
      )}

      {/* STEP 2: Configure post */}
      {step === 'configure' && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium">
              {CONTENT_TYPES.find(t => t.id === contentType)?.label}
            </span>
            <button
              type="button"
              onClick={() => setStep('type')}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Change
            </button>
          </div>

          {/* Content Mode Selector */}
          <div>
            <label className="mb-2 block text-sm font-medium">Content mode</label>
            <div className="grid grid-cols-3 gap-3">
              {CONTENT_MODES.map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setContentMode(mode.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    contentMode === mode.id ? mode.activeColor : mode.color
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {mode.id === 'controversial' && <Zap className="size-3.5" />}
                    <span className="text-sm font-semibold">{mode.label}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug opacity-70">
                    {mode.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Topic */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Topic
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. New product launch, Behind the scenes, Industry tip, Customer spotlight..."
              rows={3}
              className="w-full resize-none rounded-lg border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank and NativPost will choose a topic based on your Brand Profile.
            </p>
          </div>

          {/* Platform Selection */}
          <div>
            <label className="mb-2 block text-sm font-medium">Target platforms</label>
            <div className="space-y-2">
              {PLATFORMS.map((platform) => {
                const PIcon = platform.icon;
                const isConnected = connectedPlatformIds.includes(platform.id);
                const isSelected = selectedPlatforms.includes(platform.id);

                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => togglePlatform(platform.id)}
                    disabled={!isConnected}
                    className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                      isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                    }`}
                  >
                    <PIcon className={`size-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className={`flex-1 ${isSelected ? 'font-medium' : ''}`}>{platform.name}</span>
                    {!isConnected && (
                      <span className="text-xs text-muted-foreground">Not connected</span>
                    )}
                    {isConnected && isSelected && (
                      <Check className="size-4 text-primary" />
                    )}
                  </button>
                );
              })}
            </div>
            {connectedPlatformIds.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                No accounts connected.
                {' '}
                <Link href="/dashboard/connections" className="text-primary underline">
                  Connect platforms
                </Link>
                {' '}
                to select them here.
              </p>
            )}
          </div>

          {/* Post Enrichment Panel */}
          <div className="rounded-xl border bg-card">
            <button
              type="button"
              onClick={() => setShowEnrichment(p => !p)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <Link2 className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Post enrichment</span>
                {hasEnrichment() && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Active
                  </span>
                )}
              </div>
              {showEnrichment
                ? <ChevronUp className="size-4 text-muted-foreground" />
                : <ChevronDown className="size-4 text-muted-foreground" />}
            </button>

            {showEnrichment && (
              <div className="space-y-4 border-t p-4">
                <p className="text-xs text-muted-foreground">
                  Add links, promo codes, contact info, and other elements to weave into your post.
                </p>

                {/* CTA */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">CTA URL</label>
                    <input
                      type="url"
                      value={enrichment.cta_url}
                      onChange={e => setEnrichment(prev => ({ ...prev, cta_url: e.target.value }))}
                      placeholder="https://example.com/sale"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">CTA label</label>
                    <input
                      type="text"
                      value={enrichment.cta_label}
                      onChange={e => setEnrichment(prev => ({ ...prev, cta_label: e.target.value }))}
                      placeholder="Shop the collection"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                {/* Promo code */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Promo code</label>
                  <input
                    type="text"
                    value={enrichment.promo_code}
                    onChange={e => setEnrichment(prev => ({ ...prev, promo_code: e.target.value }))}
                    placeholder="SAVE20"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Contact info */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Contact info</label>
                  <input
                    type="text"
                    value={enrichment.contact_info}
                    onChange={e => setEnrichment(prev => ({ ...prev, contact_info: e.target.value }))}
                    placeholder="email@company.com or booking link"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Event details */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Event details</label>
                  <input
                    type="text"
                    value={enrichment.event_details}
                    onChange={e => setEnrichment(prev => ({ ...prev, event_details: e.target.value }))}
                    placeholder="March 15, 2026 at 7pm — Eko Hotel, Lagos"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Reference links */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Reference links</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={refLinkInput}
                      onChange={e => setRefLinkInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRefLink())}
                      placeholder="https://..."
                      className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={addRefLink}
                      className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                    >
                      Add
                    </button>
                  </div>
                  {enrichment.reference_links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {enrichment.reference_links.map(link => (
                        <span key={link} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[11px]">
                          {link.length > 35 ? `${link.slice(0, 35)}...` : link}
                          <button
                            type="button"
                            onClick={() => removeRefLink(link)}
                            className="ml-0.5 opacity-50 hover:opacity-100"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mentions */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Mentions</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mentionInput}
                      onChange={e => setMentionInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addMention())}
                      placeholder="@handle"
                      className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={addMention}
                      className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                    >
                      Add
                    </button>
                  </div>
                  {enrichment.custom_mentions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {enrichment.custom_mentions.map(handle => (
                        <span key={handle} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[11px]">
                          {handle}
                          <button
                            type="button"
                            onClick={() => removeMention(handle)}
                            className="ml-0.5 opacity-50 hover:opacity-100"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || selectedPlatforms.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isGenerating
              ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating
                    {contentMode !== 'normal' ? ` (${contentMode} mode)` : ''}
                    ...
                  </>
                )
              : (
                  <>
                    <Sparkles className="size-4" />
                    Generate content
                  </>
                )}
          </button>
        </div>
      )}

      {/* STEP 3: Review variants */}
      {step === 'review' && (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">
                {variants.length}
                {' '}
                variants generated
                {contentMode !== 'normal' && (
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    contentMode === 'concise'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-orange-50 text-orange-700'
                  }`}
                  >
                    {contentMode}
                    {' '}
                    mode
                  </span>
                )}
              </h2>
              <p className="text-xs text-muted-foreground">Select the best one, then approve.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep('configure'); setVariants([]);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
            >
              <RefreshCw className="size-3" />
              Regenerate
            </button>
          </div>

          {variants.map(variant => (
            <button
              key={variant.id}
              type="button"
              onClick={() => setSelectedVariant(variant.id)}
              className={`w-full rounded-xl border bg-card p-5 text-left transition-all ${
                selectedVariant === variant.id
                  ? 'border-primary ring-2 ring-primary/15'
                  : 'hover:border-muted-foreground/20'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {variant.variantNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Variant
                    {' '}
                    {variant.variantNumber}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {variant.antiSlopScore !== null && (() => {
                    const sl = scoreLabel(variant.antiSlopScore);
                    return (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sl.color}`}>
                        {Math.round(variant.antiSlopScore * 100)}
                        %
                        {' '}
                        {sl.text}
                      </span>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation(); navigator.clipboard.writeText(variant.caption);
                    }}
                    className="rounded p-1.5 hover:bg-muted"
                    title="Copy"
                  >
                    <Copy className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <p className="whitespace-pre-wrap text-sm leading-relaxed">{variant.caption}</p>

              {variant.hashtags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {variant.hashtags.map(tag => (
                    <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{tag}</span>
                  ))}
                </div>
              )}

              {/* Enrichment tracking */}
              {variant.enrichmentApplied && variant.enrichmentApplied.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5 border-t pt-3">
                  <Link2 className="size-3 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    Enrichment applied:
                    {' '}
                    {variant.enrichmentApplied.map(e => e.replace(/_/g, ' ')).join(', ')}
                  </span>
                </div>
              )}

              {/* Quality flags */}
              {variant.qualityFlags && variant.qualityFlags.length > 0 && (
                <div className="mt-2 space-y-1 border-t pt-3">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-orange-500/70">
                    Quality notes
                  </span>
                  {variant.qualityFlags.slice(0, 3).map((flag, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground">{flag}</p>
                  ))}
                </div>
              )}

              {Object.keys(variant.platformSpecific).length > 0 && (
                <div className="mt-4 space-y-2 border-t pt-3">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    Platform versions
                  </span>
                  {Object.entries(variant.platformSpecific).map(([platform, text]) => {
                    const PIcon = PLATFORMS.find(p => p.id === platform)?.icon;
                    return (
                      <div key={platform} className="rounded-lg bg-muted/40 p-3">
                        <div className="mb-1 flex items-center gap-1.5">
                          {PIcon && <PIcon className="size-3.5 text-muted-foreground" />}
                          <span className="text-[11px] font-medium capitalize">{platform}</span>
                        </div>
                        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{text}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </button>
          ))}

          {selectedVariant && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={isApproving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isApproving
                ? <Loader2 className="size-4 animate-spin" />
                : <Check className="size-4" />}
              {scheduledDate ? 'Approve and set schedule' : 'Approve selected variant'}
            </button>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      )}
    </>
  );
}

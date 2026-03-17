'use client';

import {
  AlignLeft,
  ArrowLeft,
  Check,
  Copy,
  Image as ImageIcon,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {  useEffect, useState } from 'react';

import {
  PLATFORMS,
 
} from '@/components/icons/PlatformIcons';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
interface Variant {
  id: string;
  caption: string;
  hashtags: string[];
  antiSlopScore: number | null;
  qualityFlags: string[];
  variantNumber: number;
  platformSpecific: Record<string, string>;
}

interface ConnectedAccount {
  id: string;
  platform: string;
  platformUsername: string | null;
  isActive: boolean;
}

const CONTENT_TYPES = [
  { id: 'text_only', label: 'Text Post', description: 'Text-only post for platforms that support it', icon: AlignLeft },
  { id: 'single_image', label: 'Image Post', description: 'Single image with caption', icon: ImageIcon },
  { id: 'carousel', label: 'Carousel', description: 'Multi-image carousel post', icon: Layers },
  { id: 'reel', label: 'Video Post', description: 'Reel, Short, or video caption', icon: Video },
];

// -----------------------------------------------------------
// CREATE CONTENT PAGE
// -----------------------------------------------------------
export default function ContentCreatePage() {
  const router = useRouter();
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

  // Fetch connected accounts
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
    .filter((a) => a.isActive)
    .map((a) => a.platform);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const selectContentType = (id: string) => {
    setContentType(id);
    setStep('configure');
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
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic || undefined,
          contentType,
          targetPlatforms: selectedPlatforms,
          numVariants: 3,
        }),
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
    if (!selectedVariant) return;
    setIsApproving(true);
    try {
      await fetch(`/api/content/${selectedVariant}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', isSelectedVariant: true }),
      });
      router.push('/dashboard/posts');
    } catch {
      setError('Failed to approve.');
    } finally {
      setIsApproving(false);
    }
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
            onClick={() => setStep(step === 'review' ? 'configure' : 'type')}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
            Back
          </button>
        )}
      </div>

      {/* STEP 1: Choose content type */}
      {step === 'type' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CONTENT_TYPES.map((type) => {
              const Icon = type.icon;
              // Determine which platforms support this type
              const supported = type.id === 'text_only'
                ? ['facebook', 'twitter', 'linkedin']
                : type.id === 'reel'
                  ? ['instagram', 'tiktok', 'facebook', 'twitter', 'linkedin', 'youtube']
                  : ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok'];

              return (
                <button
                  key={type.id}
                  onClick={() => selectContentType(type.id)}
                  className="group flex flex-col items-center rounded-xl border-2 border-dashed border-border/60 bg-card p-8 text-center transition-all hover:border-[#16A34A]/40 hover:bg-[#16A34A]/5"
                >
                  <Icon className="mb-4 size-10 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" strokeWidth={1.2} />
                  <h3 className="text-sm font-semibold">{type.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{type.description}</p>
                  <div className="mt-4 flex items-center gap-1.5">
                    {supported.map((p) => {
                      const platform = PLATFORMS.find((pl) => pl.id === p);
                      if (!platform) return null;
                      const PIcon = platform.icon;
                      return <PIcon key={p} className="size-4 text-muted-foreground/50" />;
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Connect accounts prompt */}
          {connectedAccounts.length === 0 && (
            <div className="mt-6 flex items-center justify-between rounded-xl bg-muted/50 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full border">
                  <span className="text-sm text-muted-foreground">i</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  Connect your social media accounts to publish content
                </span>
              </div>
              <Link
                href="/dashboard/connections"
                className="rounded-lg bg-[#16A34A] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#15803d]"
              >
                Connect Accounts
              </Link>
            </div>
          )}
        </>
      )}

      {/* STEP 2: Configure post */}
      {step === 'configure' && (
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Selected type badge */}
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium">
              {CONTENT_TYPES.find((t) => t.id === contentType)?.label}
            </span>
            <button
              onClick={() => setStep('type')}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Change
            </button>
          </div>

          {/* Topic */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Topic
              <span className="ml-1 text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. New product launch, Behind the scenes, Industry tip, Customer spotlight..."
              rows={3}
              className="w-full resize-none rounded-lg border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/20"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank and NativPost will choose a topic based on your Brand Profile.
            </p>
          </div>

          {/* Platform selection */}
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
                    onClick={() => togglePlatform(platform.id)}
                    disabled={!isConnected}
                    className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                      isSelected
                        ? 'border-[#16A34A] bg-[#16A34A]/5'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <PIcon className={`size-5 ${isSelected ? 'text-[#16A34A]' : 'text-muted-foreground'}`} />
                    <span className={`flex-1 ${isSelected ? 'font-medium' : ''}`}>
                      {platform.name}
                    </span>
                    {!isConnected && (
                      <span className="text-xs text-muted-foreground">Not connected</span>
                    )}
                    {isConnected && isSelected && (
                      <Check className="size-4 text-[#16A34A]" />
                    )}
                  </button>
                );
              })}
            </div>
            {connectedPlatformIds.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                No accounts connected.{' '}
                <Link href="/dashboard/connections" className="text-[#16A34A] underline">
                  Connect platforms
                </Link>{' '}
                to select them here.
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Generate */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || selectedPlatforms.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#16A34A] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#15803d] disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Generating variants...
              </>
            ) : (
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
              <h2 className="text-sm font-semibold">{variants.length} variants generated</h2>
              <p className="text-xs text-muted-foreground">Select the best one, then approve.</p>
            </div>
            <button
              onClick={() => { setStep('configure'); setVariants([]); }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
            >
              <RefreshCw className="size-3" />
              Regenerate
            </button>
          </div>

          {variants.map((variant) => (
            <button
              key={variant.id}
              onClick={() => setSelectedVariant(variant.id)}
              className={`w-full rounded-xl border bg-card p-5 text-left transition-all ${
                selectedVariant === variant.id
                  ? 'border-[#16A34A] ring-2 ring-[#16A34A]/15'
                  : 'hover:border-muted-foreground/20'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {variant.variantNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">Variant {variant.variantNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  {variant.antiSlopScore !== null && (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      variant.antiSlopScore >= 0.8 ? 'bg-green-50 text-green-700' :
                      variant.antiSlopScore >= 0.7 ? 'bg-yellow-50 text-yellow-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {Math.round(variant.antiSlopScore * 100)}% quality
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(variant.caption); }}
                    className="rounded p-1.5 hover:bg-muted" title="Copy"
                  >
                    <Copy className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <p className="whitespace-pre-wrap text-sm leading-relaxed">{variant.caption}</p>

              {variant.hashtags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(variant.hashtags as string[]).map((tag) => (
                    <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{tag}</span>
                  ))}
                </div>
              )}

              {Object.keys(variant.platformSpecific).length > 0 && (
                <div className="mt-4 space-y-2 border-t pt-3">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">Platform versions</span>
                  {Object.entries(variant.platformSpecific).map(([platform, text]) => {
                    const PIcon = PLATFORMS.find((p) => p.id === platform)?.icon;
                    return (
                      <div key={platform} className="rounded-lg bg-muted/40 p-3">
                        <div className="mb-1 flex items-center gap-1.5">
                          {PIcon && <PIcon className="size-3.5 text-muted-foreground" />}
                          <span className="text-[11px] font-medium capitalize">{platform}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{text}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </button>
          ))}

          {selectedVariant && (
            <button
              onClick={handleApprove}
              disabled={isApproving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#16A34A] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#15803d] disabled:opacity-50"
            >
              {isApproving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Approve selected variant
            </button>
          )}
        </div>
      )}
    </>
  );
}

'use client';

import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/features/dashboard/PageHeader';

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

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'linkedin', label: 'LinkedIn', emoji: '💼' },
  { id: 'twitter', label: 'X / Twitter', emoji: '𝕏' },
  { id: 'facebook', label: 'Facebook', emoji: '📘' },
  { id: 'tiktok', label: 'TikTok', emoji: '🎵' },
];

const CONTENT_TYPES = [
  { id: 'single_image', label: 'Single image post' },
  { id: 'carousel', label: 'Carousel post' },
  { id: 'text_only', label: 'Text-only post' },
  { id: 'story', label: 'Story' },
  { id: 'reel', label: 'Reel / Short video caption' },
];

// -----------------------------------------------------------
// CONTENT CREATION PAGE
// -----------------------------------------------------------
export default function ContentCreatePage() {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [contentType, setContentType] = useState('single_image');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['instagram', 'linkedin']);
  const [isGenerating, setIsGenerating] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
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
    } catch {
      setError('Network error. Please check your connection and try again.');
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
        body: JSON.stringify({
          status: 'approved',
          isSelectedVariant: true,
        }),
      });
      router.push('/dashboard/content');
    } catch {
      setError('Failed to approve. Please try again.');
    } finally {
      setIsApproving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      <PageHeader
        title="Create content"
        description="Generate studio-crafted content from your Brand Profile."
        actions={
          <Link
            href="/dashboard/content"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
            Back to calendar
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left panel — Generation form */}
        <div className="lg:col-span-2">
          <div className="sticky top-20 space-y-6 rounded-xl border bg-card p-5">
            <div>
              <h3 className="text-sm font-semibold">What should we create?</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Leave topic blank and NativPost will choose one based on your Brand Profile.
              </p>
            </div>

            {/* Topic */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Topic <span className="text-muted-foreground">(optional)</span>
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. New product launch, Behind the scenes, Industry tip, Customer spotlight..."
                rows={3}
                className="w-full resize-none rounded-lg border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30"
              />
            </div>

            {/* Content type */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Content type</label>
              <div className="space-y-1.5">
                {CONTENT_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setContentType(type.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                      contentType === type.id
                        ? 'border-[#16A34A] bg-[#16A34A]/5 font-medium text-[#16A34A]'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Platforms */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Target platforms</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all ${
                      selectedPlatforms.includes(p.id)
                        ? 'border-[#16A34A] bg-[#16A34A]/5 font-medium'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <span>{p.emoji}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || selectedPlatforms.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#16A34A] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generating 3 variants...
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate content
                </>
              )}
            </button>

            {variants.length > 0 && (
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <RefreshCw className="size-4" />
                Regenerate
              </button>
            )}
          </div>
        </div>

        {/* Right panel — Generated variants */}
        <div className="lg:col-span-3">
          {variants.length === 0 && !isGenerating && (
            <div className="flex min-h-[500px] items-center justify-center rounded-xl border border-dashed bg-card text-center">
              <div className="max-w-xs">
                <Sparkles className="mx-auto mb-3 size-8 text-muted-foreground" />
                <h3 className="text-sm font-semibold">No content generated yet</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Configure your options on the left and click "Generate content" to get 3 studio-crafted variants.
                </p>
              </div>
            </div>
          )}

          {isGenerating && (
            <div className="flex min-h-[500px] items-center justify-center rounded-xl border bg-card">
              <div className="text-center">
                <Loader2 className="mx-auto mb-3 size-8 animate-spin text-[#16A34A]" />
                <h3 className="text-sm font-semibold">Crafting your content...</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Running through your Brand Profile, generating variants, checking quality.
                </p>
              </div>
            </div>
          )}

          {variants.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {variants.length} variants generated
                </h3>
                <span className="text-xs text-muted-foreground">
                  Click one to select, then approve
                </span>
              </div>

              {variants.map((variant) => (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariant(variant.id)}
                  className={`w-full rounded-xl border bg-card p-5 text-left transition-all ${
                    selectedVariant === variant.id
                      ? 'border-[#16A34A] ring-2 ring-[#16A34A]/20'
                      : 'hover:border-muted-foreground/30'
                  }`}
                >
                  {/* Header */}
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Variant {variant.variantNumber}
                    </span>
                    <div className="flex items-center gap-2">
                      {variant.antiSlopScore !== null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            variant.antiSlopScore >= 0.8
                              ? 'bg-green-50 text-green-700'
                              : variant.antiSlopScore >= 0.7
                                ? 'bg-yellow-50 text-yellow-700'
                                : 'bg-red-50 text-red-700'
                          }`}
                        >
                          Quality: {Math.round(variant.antiSlopScore * 100)}%
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(variant.caption);
                        }}
                        className="rounded p-1 hover:bg-muted"
                        title="Copy caption"
                      >
                        <Copy className="size-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  {/* Caption */}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {variant.caption}
                  </p>

                  {/* Hashtags */}
                  {variant.hashtags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {variant.hashtags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs text-[#16A34A]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Quality flags */}
                  {variant.qualityFlags.length > 0 && (
                    <div className="mt-3 rounded-lg bg-yellow-50 p-2">
                      <p className="text-xs font-medium text-yellow-700">Quality notes:</p>
                      {variant.qualityFlags.map((flag, i) => (
                        <p key={i} className="text-xs text-yellow-600">• {flag}</p>
                      ))}
                    </div>
                  )}

                  {/* Platform adaptations */}
                  {Object.keys(variant.platformSpecific).length > 0 && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      <span className="text-xs font-medium text-muted-foreground">
                        Platform adaptations
                      </span>
                      {Object.entries(variant.platformSpecific).map(([platform, text]) => (
                        <div key={platform} className="rounded-lg bg-muted/50 p-2">
                          <span className="text-xs font-semibold capitalize">{platform}</span>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-3">{text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ))}

              {/* Approve button */}
              {selectedVariant && (
                <button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#16A34A] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
                >
                  {isApproving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Approve selected variant
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

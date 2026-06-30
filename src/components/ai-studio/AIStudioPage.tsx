'use client';

import {
  AlertCircle,
  Captions,
  ImageIcon,
  Loader2,
  Sparkles,
  UserCircle,
  Video,
  Wand2,
} from 'lucide-react';
import Image from 'next/image';
import React, { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DURATIONS,
  estimateImageCredits,
  estimateTalkingHeadCredits,
  estimateVideoCredits,
  FORMATS,
  IMAGE_QUANTITY,
  IMAGE_TEMPLATES,
  LANGUAGES,
  VIDEO_TEMPLATES,
} from '@/lib/ai-studio';
import type { AiCreditWallet } from '@/lib/ai-studio/server';
import type { MediaAsset } from '@/types/v2';

import { AssetGallery } from './AssetGallery';
import { CreditWallet } from './CreditWallet';
import { ModelSelector } from './ModelSelector';
import { MediaPickerModal } from '@/components/media/MediaPickerModal';

export function AIStudioPage() {
  const [activeTab, setActiveTab] = useState<'images' | 'videos'>('images');
  const [wallet, setWallet] = useState<AiCreditWallet | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<MediaAsset[] | null>(null);

  // Image fields
  const [imageModel, setImageModel] = useState('fastlane-v8');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageReference, setImageReference] = useState('');
  const [imageFormat, setImageFormat] = useState('9:16');
  const [imageQuantity, setImageQuantity] = useState(1);
  const [imageTemplate, setImageTemplate] = useState('none');

  // Video fields
  const [videoSubMode, setVideoSubMode] = useState<'video' | 'talking-head-ugc'>('video');
  const [videoModel, setVideoModel] = useState('pixverse-v6');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoReference, setVideoReference] = useState('');
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoFormat, setVideoFormat] = useState('9:16');
  const [videoTemplate, setVideoTemplate] = useState('none');

  // Talking head fields
  const [thScript, setThScript] = useState('');
  const [thLanguage, setThLanguage] = useState('en');
  const [thDuration, setThDuration] = useState(5);
  const [thCaptions, setThCaptions] = useState(true);

  const imageEstimate = useMemo(
    () => estimateImageCredits(imageModel, imageQuantity),
    [imageModel, imageQuantity],
  );

  const videoEstimate = useMemo(
    () => (videoSubMode === 'video' ? estimateVideoCredits(videoModel, videoDuration) : estimateTalkingHeadCredits(thScript.trim().split(/\s+/).filter(Boolean).length, thDuration)),
    [videoSubMode, videoModel, videoDuration, thScript, thDuration],
  );

  const totalCredits = wallet ? Math.max(0, wallet.monthly.limit - wallet.monthly.used) + wallet.addon.remaining : 0;
  const estimate = activeTab === 'images' ? imageEstimate : videoEstimate;
  const canGenerate = !generating && totalCredits >= estimate;

  const loadAssets = React.useCallback(async () => {
    setLoadingAssets(true);
    try {
      const types = activeTab === 'images'
        ? 'ai_image,ai_graphic,ai_scene,branded_card'
        : 'ai_video,talking_head_ugc,slideshow_video,ugc_ad_video,text_motion_video,data_story_video';
      const res = await fetch(`/api/media-assets?assetType=${types}&limit=50`);
      const data = await res.json();
      setAssets(data.items || []);
    } catch (err) {
      console.error('Failed to load assets', err);
    } finally {
      setLoadingAssets(false);
    }
  }, [activeTab]);

  const refreshWallet = React.useCallback(async () => {
    try {
      const res = await fetch('/api/ai-studio/credits');
      const data = await res.json();
      setWallet(data.wallet || null);
    } catch (err) {
      console.error('Failed to load wallet', err);
    }
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    setLastResult(null);

    try {
      if (activeTab === 'images') {
        const res = await fetch('/api/ai-studio/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: imageModel,
            prompt: imagePrompt,
            referenceImageUrl: imageReference || undefined,
            aspectRatio: imageFormat,
            quantity: imageQuantity,
            template: imageTemplate,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Image generation failed');
        }
        setWallet(data.wallet);
        setLastResult(mapSavedToAssets(data.savedAssets as Array<{ id: string; url: string; format?: string }>, 'image'));
      } else {
        const body: Record<string, unknown> = {
          subMode: videoSubMode,
          duration: videoSubMode === 'video' ? videoDuration : thDuration,
          aspectRatio: videoFormat,
          referenceImageUrl: videoReference || undefined,
        };

        if (videoSubMode === 'video') {
          body.modelId = videoModel;
          body.prompt = videoPrompt;
          body.template = videoTemplate;
        } else {
          body.script = thScript;
          body.language = thLanguage;
          body.captions = thCaptions;
        }

        const res = await fetch('/api/ai-studio/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Video generation failed');
        }
        setWallet(data.wallet);
        setLastResult(mapSavedToAssets(data.savedAssets as Array<{ id: string; url: string; format?: string }>, 'video'));
      }

      loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleAnimate = async (asset: MediaAsset) => {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch('/api/ai-studio/video/animate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: asset.url,
          prompt: 'Animate this image',
          duration: 5,
          aspectRatio: asset.aspectRatio || '9:16',
          modelId: 'sedance-2.0',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Animation failed');
      }
      setWallet(data.wallet);
      setLastResult(mapSavedToAssets(data.savedAssets as Array<{ id: string; url: string; format?: string }>, 'video'));
      setActiveTab('videos');
      loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Animation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleUseImage = (asset: MediaAsset) => {
    if (activeTab === 'images') {
      setImageReference(asset.url);
    } else {
      setVideoReference(asset.url);
    }
  };

  const wordCount = thScript.trim().split(/\s+/).filter(Boolean).length;
  const wordWarning = videoSubMode === 'talking-head-ugc' && wordCount > 0 && wordCount < 10;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-1 rounded-full border border-border bg-muted p-1">
            <TabButton active={activeTab === 'images'} onClick={() => setActiveTab('images')} icon={ImageIcon} label="Images" />
            <TabButton active={activeTab === 'videos'} onClick={() => setActiveTab('videos')} icon={Video} label="Videos" />
          </div>
          <CreditWallet estimate={estimate} />
        </div>
      </div>

      {/* Main editor */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: generation controls */}
          <div className="lg:col-span-5">
            <div className="sticky top-24 space-y-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-card-foreground">
                  {activeTab === 'images' ? 'Generate Image' : 'Generate Video'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'images'
                    ? 'Create custom images for your content.'
                    : 'Generate short-form video from a prompt or script.'}
                </p>
              </div>

              {activeTab === 'images' ? (
                <ImageControls
                  model={imageModel}
                  setModel={setImageModel}
                  prompt={imagePrompt}
                  setPrompt={setImagePrompt}
                  reference={imageReference}
                  setReference={setImageReference}
                  format={imageFormat}
                  setFormat={setImageFormat}
                  quantity={imageQuantity}
                  setQuantity={setImageQuantity}
                  template={imageTemplate}
                  setTemplate={setImageTemplate}
                />
              ) : (
                <VideoControls
                  subMode={videoSubMode}
                  setSubMode={setVideoSubMode}
                  model={videoModel}
                  setModel={setVideoModel}
                  prompt={videoPrompt}
                  setPrompt={setVideoPrompt}
                  reference={videoReference}
                  setReference={setVideoReference}
                  duration={videoDuration}
                  setDuration={setVideoDuration}
                  format={videoFormat}
                  setFormat={setVideoFormat}
                  template={videoTemplate}
                  setTemplate={setVideoTemplate}
                  thScript={thScript}
                  setThScript={setThScript}
                  thLanguage={thLanguage}
                  setThLanguage={setThLanguage}
                  thDuration={thDuration}
                  setThDuration={setThDuration}
                  thCaptions={thCaptions}
                  setThCaptions={setThCaptions}
                  wordCount={wordCount}
                  wordWarning={wordWarning}
                />
              )}

              <div className="space-y-3 border-t border-border pt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {estimate > 0 ? `${estimate} credits` : 'Free'}
                  </span>
                  <span className="text-muted-foreground">
                    Balance:
                    {' '}
                    {totalCredits}
                  </span>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 size-4" />
                      Generate
                      {' '}
                      {activeTab === 'images' ? 'Images' : videoSubMode === 'talking-head-ugc' ? 'Talking Head' : 'Video'}
                    </>
                  )}
                </Button>
                {totalCredits < estimate && (
                  <p className="text-center text-xs text-destructive">
                    Need
                    {' '}
                    {estimate - totalCredits}
                    {' '}
                    more credits.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right: gallery */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-card-foreground">
                {activeTab === 'images' ? 'My Images' : 'My Videos'}
              </h2>
              <AssetGallery
                assets={lastResult ? [...lastResult, ...assets] : assets}
                mode={activeTab === 'images' ? 'image' : 'video'}
                loading={loadingAssets}
                onUseImage={handleUseImage}
                onAnimate={activeTab === 'images' ? handleAnimate : undefined}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function PromptBox({ value, onChange, placeholder, icon: Icon, reference, onReferenceClick, onReferenceClear }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: React.ElementType;
  reference?: string;
  onReferenceClick?: () => void;
  onReferenceClear?: () => void;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-background p-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
      <button
        type="button"
        onClick={onReferenceClick}
        className="group relative flex size-14 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted text-muted-foreground hover:border-purple-300 hover:bg-purple-50 transition-colors"
      >
        {reference ? (
          <>
            <Image src={reference} alt="Reference" fill className="object-cover" sizes="56px" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            {onReferenceClear && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onReferenceClear(); }}
                className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-3">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            )}
          </>
        ) : (
          <Icon className="size-4" />
        )}
      </button>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-0 flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        rows={3}
      />
    </div>
  );
}

function ImageControls(props: {
  model: string;
  setModel: (v: string) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  reference: string;
  setReference: (v: string) => void;
  format: string;
  setFormat: (v: string) => void;
  quantity: number;
  setQuantity: (v: number) => void;
  template: string;
  setTemplate: (v: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-4">
      <PromptBox
        value={props.prompt}
        onChange={props.setPrompt}
        placeholder="Describe the image you want to generate..."
        icon={ImageIcon}
        reference={props.reference || undefined}
        onReferenceClick={() => setPickerOpen(true)}
        onReferenceClear={() => props.setReference('')}
      />

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={props.setReference}
        title="Select Reference Image"
      />

      <div className="space-y-3">
        <ControlRow label="Model">
          <ModelSelector type="image" value={props.model} onChange={props.setModel} />
        </ControlRow>
        <ControlRow label="Format">
          <Select value={props.format} onValueChange={props.setFormat}>
            <SelectTrigger className="h-9 w-auto rounded-lg border-border px-3 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                  {' '}
                  {f.ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlRow>
        <ControlRow label="Quantity">
          <Select value={String(props.quantity)} onValueChange={v => props.setQuantity(Number(v))}>
            <SelectTrigger className="h-9 w-auto rounded-lg border-border px-3 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_QUANTITY.map(q => (
                <SelectItem key={q} value={String(q)}>{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlRow>
        <ControlRow label="Template">
          <Select value={props.template} onValueChange={props.setTemplate}>
            <SelectTrigger className="h-9 w-auto rounded-lg border-border px-3 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_TEMPLATES.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlRow>
      </div>
    </div>
  );
}

function VideoControls(props: {
  subMode: 'video' | 'talking-head-ugc';
  setSubMode: (v: 'video' | 'talking-head-ugc') => void;
  model: string;
  setModel: (v: string) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  reference: string;
  setReference: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  format: string;
  setFormat: (v: string) => void;
  template: string;
  setTemplate: (v: string) => void;
  thScript: string;
  setThScript: (v: string) => void;
  thLanguage: string;
  setThLanguage: (v: string) => void;
  thDuration: number;
  setThDuration: (v: number) => void;
  thCaptions: boolean;
  setThCaptions: (v: boolean) => void;
  wordCount: number;
  wordWarning: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <SubModeTab active={props.subMode === 'video'} onClick={() => props.setSubMode('video')} label="Video" />
        <SubModeTab active={props.subMode === 'talking-head-ugc'} onClick={() => props.setSubMode('talking-head-ugc')} label="Talking Head UGC" />
      </div>

      {props.subMode === 'video' ? (
        <>
          <PromptBox
            value={props.prompt}
            onChange={props.setPrompt}
            placeholder="Describe the motion (optional, e.g. slow zoom on the face)"
            icon={Wand2}
            reference={props.reference || undefined}
            onReferenceClick={() => setPickerOpen(true)}
            onReferenceClear={() => props.setReference('')}
          />
          <div className="space-y-3">
            <ControlRow label="Model">
              <ModelSelector type="video" value={props.model} onChange={props.setModel} />
            </ControlRow>
            <ControlRow label="Template">
              <Select value={props.template} onValueChange={props.setTemplate}>
                <SelectTrigger className="h-9 w-auto rounded-lg border-border px-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_TEMPLATES.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ControlRow>
            <ControlRow label="Duration">
              <div className="flex items-center gap-2">
                {DURATIONS.map(d => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => props.setDuration(d)}
                    className={`h-9 rounded-lg border px-3 text-sm font-medium transition-colors ${
                      props.duration === d
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {d}
                    s
                  </button>
                ))}
              </div>
            </ControlRow>
            <ControlRow label="Format">
              <Select value={props.format} onValueChange={props.setFormat}>
                <SelectTrigger className="h-9 w-auto rounded-lg border-border px-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ControlRow>
          </div>
        </>
      ) : (
        <>
          <PromptBox
            value={props.thScript}
            onChange={props.setThScript}
            placeholder="Write what the person should say..."
            icon={UserCircle}
            reference={props.reference || undefined}
            onReferenceClick={() => setPickerOpen(true)}
            onReferenceClear={() => props.setReference('')}
          />
          {props.wordWarning && (
            <p className="text-xs text-amber-600">
              {props.wordCount}
              {' '}
              words may be too short for
              {props.thDuration}
              s. Target 10-15 words.
            </p>
          )}
          <div className="space-y-3">
            <ControlRow label="Language">
              <Select value={props.thLanguage} onValueChange={props.setThLanguage}>
                <SelectTrigger className="h-9 w-auto rounded-lg border-border px-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ControlRow>
            <ControlRow label="Duration">
              <Select value={String(props.thDuration)} onValueChange={v => props.setThDuration(Number(v))}>
                <SelectTrigger className="h-9 w-auto rounded-lg border-border px-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map(d => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                      s
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ControlRow>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
              <Captions className="size-4 text-muted-foreground" />
              Captions
              <input
                type="checkbox"
                checked={props.thCaptions}
                onChange={e => props.setThCaptions(e.target.checked)}
                className="ml-auto size-4 rounded border-border text-primary focus:ring-primary"
              />
            </label>
          </div>
        </>
      )}

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={props.setReference}
        title="Select Reference Image"
      />
    </div>
  );
}

function SubModeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function mapSavedToAssets(saved: Array<{ id: string; url: string; format?: string }>, assetType: 'image' | 'video'): MediaAsset[] {
  const now = new Date().toISOString();
  return saved.map(s => ({
    id: s.id,
    orgId: '',
    uploadcareUuid: null,
    url: s.url,
    thumbnailUrl: s.url,
    assetType,
    mimeType: null,
    fileSize: null,
    width: null,
    height: null,
    aspectRatio: s.format || '9:16',
    durationSeconds: assetType === 'video' ? 5 : null,
    source: 'ai_generated',
    description: null,
    aiMetadata: {},
    tags: [],
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  }));
}

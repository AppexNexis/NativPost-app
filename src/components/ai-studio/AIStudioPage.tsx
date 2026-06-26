"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Loader2,
  ImageIcon,
  Video,
  AlertCircle,
  UserCircle,
  Languages,
  Clock,
  Captions,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreditWallet } from "./CreditWallet";
import { ModelSelector } from "./ModelSelector";
import { AssetGallery } from "./AssetGallery";
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
} from "@/lib/ai-studio";
import type { AiCreditWallet } from "@/lib/ai-studio/server";
import type { MediaAsset } from "@/types/v2";

export function AIStudioPage() {
  const [activeTab, setActiveTab] = useState<"images" | "videos">("images");
  const [wallet, setWallet] = useState<AiCreditWallet | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<MediaAsset[] | null>(null);

  // Image fields
  const [imageModel, setImageModel] = useState("fastlane-v8");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageReference, setImageReference] = useState("");
  const [imageFormat, setImageFormat] = useState("9:16");
  const [imageQuantity, setImageQuantity] = useState(1);
  const [imageTemplate, setImageTemplate] = useState("none");

  // Video fields
  const [videoSubMode, setVideoSubMode] = useState<"video" | "talking-head-ugc">("video");
  const [videoModel, setVideoModel] = useState("pixverse-v6");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoReference, setVideoReference] = useState("");
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoFormat, setVideoFormat] = useState("9:16");
  const [videoTemplate, setVideoTemplate] = useState("none");

  // Talking head fields
  const [thScript, setThScript] = useState("");
  const [thLanguage, setThLanguage] = useState("en");
  const [thDuration, setThDuration] = useState(5);
  const [thCaptions, setThCaptions] = useState(true);

  const imageEstimate = useMemo(
    () => estimateImageCredits(imageModel, imageQuantity),
    [imageModel, imageQuantity]
  );

  const videoEstimate = useMemo(
    () => (videoSubMode === "video" ? estimateVideoCredits(videoModel, videoDuration) : estimateTalkingHeadCredits(thScript.trim().split(/\s+/).filter(Boolean).length, thDuration)),
    [videoSubMode, videoModel, videoDuration, thScript, thDuration]
  );

  const totalCredits = wallet ? Math.max(0, wallet.monthly.limit - wallet.monthly.used) + wallet.addon.remaining : 0;
  const estimate = activeTab === "images" ? imageEstimate : videoEstimate;
  const canGenerate = !generating && totalCredits >= estimate;

  useEffect(() => {
    loadAssets();
  }, [activeTab]);

  const loadAssets = async () => {
    setLoadingAssets(true);
    try {
      const types = activeTab === "images"
        ? "ai_image,ai_graphic,ai_scene,branded_card"
        : "ai_video,talking_head_ugc,slideshow_video,ugc_ad_video,text_motion_video,data_story_video";
      const res = await fetch(`/api/media-assets?assetType=${types}&limit=50`);
      const data = await res.json();
      setAssets(data.items || []);
    } catch (err) {
      console.error("Failed to load assets", err);
    } finally {
      setLoadingAssets(false);
    }
  };

  const refreshWallet = async () => {
    try {
      const res = await fetch("/api/ai-studio/credits");
      const data = await res.json();
      setWallet(data.wallet || null);
    } catch (err) {
      console.error("Failed to load wallet", err);
    }
  };

  useEffect(() => {
    refreshWallet();
  }, []);

  const handleGenerate = async () => {
    setError(null);
    setGenerating(true);
    setLastResult(null);

    try {
      if (activeTab === "images") {
        const res = await fetch("/api/ai-studio/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        if (!res.ok) throw new Error(data.error || "Image generation failed");
        setWallet(data.wallet);
        setLastResult(mapSavedToAssets(data.savedAssets as Array<{ id: string; url: string; format?: string }>, "image"));
      } else {
        const body: Record<string, unknown> = {
          subMode: videoSubMode,
          duration: videoSubMode === "video" ? videoDuration : thDuration,
          aspectRatio: videoFormat,
          referenceImageUrl: videoReference || undefined,
        };

        if (videoSubMode === "video") {
          body.modelId = videoModel;
          body.prompt = videoPrompt;
          body.template = videoTemplate;
        } else {
          body.script = thScript;
          body.language = thLanguage;
          body.captions = thCaptions;
        }

        const res = await fetch("/api/ai-studio/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Video generation failed");
        setWallet(data.wallet);
        setLastResult(mapSavedToAssets(data.savedAssets as Array<{ id: string; url: string; format?: string }>, "video"));
      }

      loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleAnimate = async (asset: MediaAsset) => {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/ai-studio/video/animate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: asset.url,
          prompt: "Animate this image",
          duration: 5,
          aspectRatio: asset.aspectRatio || "9:16",
          modelId: "sedance-2.0",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Animation failed");
      setWallet(data.wallet);
      setLastResult(mapSavedToAssets(data.savedAssets as Array<{ id: string; url: string; format?: string }>, "video"));
      setActiveTab("videos");
      loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Animation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleUseImage = (asset: MediaAsset) => {
    if (activeTab === "images") {
      setImageReference(asset.url);
    } else {
      setVideoReference(asset.url);
    }
  };

  const wordCount = thScript.trim().split(/\s+/).filter(Boolean).length;
  const wordWarning = videoSubMode === "talking-head-ugc" && wordCount > 0 && wordCount < 10;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 p-1">
            <TabButton active={activeTab === "images"} onClick={() => setActiveTab("images")} icon={ImageIcon} label="Images" />
            <TabButton active={activeTab === "videos"} onClick={() => setActiveTab("videos")} icon={Video} label="Videos" />
          </div>
          <CreditWallet estimate={estimate} />
        </div>
      </div>

      {/* Main gallery area */}
      <div className="flex-1 overflow-y-auto px-4 pb-[420px] pt-6 sm:px-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              {activeTab === "images" ? "My Images" : "My Videos"}
            </h2>
            <AssetGallery
              assets={lastResult ? [...lastResult, ...assets] : assets}
              mode={activeTab === "images" ? "image" : "video"}
              loading={loadingAssets}
              onUseImage={handleUseImage}
              onAnimate={activeTab === "images" ? handleAnimate : undefined}
            />
          </div>
        </div>
      </div>

      {/* Bottom generation drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white px-4 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] sm:px-6">
        <div className="mx-auto max-w-6xl">
          {/* Drawer toggle nub */}
          <div className="mx-auto mb-3 flex justify-center">
            <div className="h-1.5 w-10 rounded-full bg-gray-200" />
          </div>

          {activeTab === "images" ? (
            <ImageDrawer
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
            <VideoDrawer
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

          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="text-sm">
              {totalCredits < estimate ? (
                <span className="text-red-600">
                  Need {estimate - totalCredits} more credits — you have {totalCredits}.
                </span>
              ) : (
                <span className="text-gray-500">
                  {estimate > 0 && `${estimate} credits will be used`}
                </span>
              )}
            </div>
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="h-10 rounded-full bg-purple-600 px-6 hover:bg-purple-700 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate {activeTab === "images" ? `(${estimate} credits)` : videoSubMode === "talking-head-ugc" ? "Talking Head UGC" : "video"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-white text-purple-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function PromptBox({ value, onChange, placeholder, icon: Icon }: { value: string; onChange: (v: string) => void; placeholder: string; icon: React.ElementType }) {
  return (
    <div className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3 focus-within:border-purple-300 focus-within:ring-1 focus-within:ring-purple-300">
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400">
        <Icon className="h-4 w-4" />
        <span className="text-[8px] font-medium uppercase">Image</span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-0 flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        rows={2}
      />
    </div>
  );
}

function ImageDrawer(props: {
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
  return (
    <div className="space-y-4">
      <PromptBox value={props.prompt} onChange={props.setPrompt} placeholder="e.g. woman selfie" icon={ImageIcon} />
      {props.reference && (
        <div className="relative h-16 w-16 overflow-hidden rounded-lg">
          <Image src={props.reference} alt="Reference" fill className="object-cover" sizes="64px" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ModelSelector type="image" value={props.model} onChange={props.setModel} />
        <Select value={props.format} onValueChange={props.setFormat}>
          <SelectTrigger className="h-9 w-auto rounded-full border-gray-200 px-3 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMATS.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.label} {f.ratio}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(props.quantity)} onValueChange={(v) => props.setQuantity(Number(v))}>
          <SelectTrigger className="h-9 w-auto rounded-full border-gray-200 px-3 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMAGE_QUANTITY.map((q) => (
              <SelectItem key={q} value={String(q)}>{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={props.template} onValueChange={props.setTemplate}>
          <SelectTrigger className="h-9 w-auto rounded-full border-gray-200 px-3 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMAGE_TEMPLATES.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function VideoDrawer(props: {
  subMode: "video" | "talking-head-ugc";
  setSubMode: (v: "video" | "talking-head-ugc") => void;
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
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <SubModeTab active={props.subMode === "video"} onClick={() => props.setSubMode("video")} label="Video" />
        <SubModeTab active={props.subMode === "talking-head-ugc"} onClick={() => props.setSubMode("talking-head-ugc")} label="Talking Head UGC" />
      </div>

      {props.subMode === "video" ? (
        <>
          <PromptBox value={props.prompt} onChange={props.setPrompt} placeholder="describe the motion (optional, e.g. slow zoom on the face)" icon={ImageIcon} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-amber-600">Free · ~1-3 min</span>
            <ModelSelector type="video" value={props.model} onChange={props.setModel} />
            <Select value={props.template} onValueChange={props.setTemplate}>
              <SelectTrigger className="h-9 w-auto rounded-full border-gray-200 px-3 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIDEO_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => props.setDuration(d)}
                className={`h-9 rounded-full border px-3 text-sm font-medium transition-colors ${
                  props.duration === d
                    ? "border-purple-500 bg-purple-50 text-purple-700"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {d}s
              </button>
            ))}
            <Select value={props.format} onValueChange={props.setFormat}>
              <SelectTrigger className="h-9 w-auto rounded-full border-gray-200 px-3 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : (
        <>
          <PromptBox value={props.thScript} onChange={props.setThScript} placeholder="write what the person should say" icon={UserCircle} />
          {props.wordWarning && (
            <p className="text-xs text-amber-600">
              {props.wordCount} words may be too short for {props.thDuration}s. Target 10-15 words.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Languages className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Language</span>
              <Select value={props.thLanguage} onValueChange={props.setThLanguage}>
                <SelectTrigger className="h-9 w-auto rounded-full border-gray-200 px-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Duration</span>
              <Select value={String(props.thDuration)} onValueChange={(v) => props.setThDuration(Number(v))}>
                <SelectTrigger className="h-9 w-auto rounded-full border-gray-200 px-3 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}s</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700">
              <Captions className="h-4 w-4 text-gray-400" />
              Captions
              <input
                type="checkbox"
                checked={props.thCaptions}
                onChange={(e) => props.setThCaptions(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
            </label>
          </div>
        </>
      )}

      {props.reference && (
        <div className="relative h-16 w-16 overflow-hidden rounded-lg">
          <Image src={props.reference} alt="Reference" fill className="object-cover" sizes="64px" />
        </div>
      )}
    </div>
  );
}

function SubModeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

function mapSavedToAssets(saved: Array<{ id: string; url: string; format?: string }>, assetType: 'image' | 'video'): MediaAsset[] {
  const now = new Date().toISOString();
  return saved.map((s) => ({
    id: s.id,
    orgId: "",
    uploadcareUuid: null,
    url: s.url,
    thumbnailUrl: s.url,
    assetType,
    mimeType: null,
    fileSize: null,
    width: null,
    height: null,
    aspectRatio: s.format || "9:16",
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

"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  Wand2,
  Loader2,
  ImageIcon,
  Download,
  Save,
  Sparkles,
  Square,
  RectangleVertical,
  RectangleHorizontal,
  Check,
  ChevronDown,
  UserCircle,
  Palette,
  AlertCircle,
  Trash2,
  RefreshCw,
} from "lucide-react";
import type { AIInfluencer, MediaAsset } from "@/types/v2";

interface AISceneGeneratorProps {
  influencers: AIInfluencer[];
  brandColor?: string;
}

interface FormatOption {
  id: string;
  label: string;
  ratio: string;
  icon: React.ReactNode;
}

interface StyleOption {
  id: string;
  label: string;
}

interface OverlayOption {
  id: string;
  label: string;
}

interface GeneratedScene {
  id: string;
  images: Record<string, string>;
  prompt: string;
  imageStyle: string;
  overlayStyle: string;
  influencerId?: string;
  createdAt: string;
  savedToLibrary: boolean;
}

const FORMATS: FormatOption[] = [
  { id: "square", label: "Square", ratio: "1:1", icon: <Square className="h-4 w-4" /> },
  { id: "vertical", label: "Vertical", ratio: "9:16", icon: <RectangleVertical className="h-4 w-4" /> },
  { id: "landscape", label: "Landscape", ratio: "16:9", icon: <RectangleHorizontal className="h-4 w-4" /> },
  { id: "portrait", label: "Portrait", ratio: "4:5", icon: <RectangleVertical className="h-4 w-4" /> },
];

const STYLES: StyleOption[] = [
  { id: "minimal", label: "Minimal" },
  { id: "vibrant", label: "Vibrant" },
  { id: "professional", label: "Professional" },
  { id: "elegant", label: "Elegant" },
  { id: "bold", label: "Bold" },
  { id: "cinematic", label: "Cinematic" },
];

const OVERLAY_STYLES: OverlayOption[] = [
  { id: "standard", label: "Standard" },
  { id: "minimal", label: "Minimal" },
  { id: "none", label: "None" },
];

const PROMPT_PRESETS = [
  "A professional in a modern office overlooking a city skyline",
  "A team collaborating around a whiteboard in a creative workspace",
  "A product showcase on a clean marble surface with soft lighting",
  "A confident entrepreneur speaking at a conference stage",
  "A cozy workspace with laptop and coffee on a wooden desk",
  "A vibrant street scene with colorful storefronts and people",
  "A minimalist product flat lay with botanical accents",
  "A sunset beach scene with warm golden tones",
];

export function AISceneGenerator({ influencers, brandColor = "#864FFE" }: AISceneGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<string[]>(["square", "vertical"]);
  const [imageStyle, setImageStyle] = useState("professional");
  const [overlayStyle, setOverlayStyle] = useState("standard");
  const [includeInfluencer, setIncludeInfluencer] = useState(false);
  const [selectedInfluencerId, setSelectedInfluencerId] = useState("");
  const [overlayHeadline, setOverlayHeadline] = useState("");
  const [overlaySubtext, setOverlaySubtext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<GeneratedScene[]>([]);
  const [savedAssets, setSavedAssets] = useState<MediaAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  // Load existing scenes from media library on mount
  useEffect(() => {
    loadSavedAssets();
  }, []);

  const loadSavedAssets = async () => {
    setIsLoadingAssets(true);
    try {
      const res = await fetch("/api/media-assets?assetType=ai_scene&limit=20");
      const data = await res.json();
      if (res.ok) {
        setSavedAssets(data.items || []);
      }
    } catch (err) {
      console.error("Failed to load assets:", err);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  const toggleFormat = (formatId: string) => {
    setSelectedFormats((prev) =>
      prev.includes(formatId) ? prev.filter((f) => f !== formatId) : [...prev, formatId]
    );
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a scene description");
      return;
    }
    if (selectedFormats.length === 0) {
      setError("Please select at least one format");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const aspectRatio = selectedFormats.includes("vertical")
        ? "9:16"
        : selectedFormats.includes("square")
        ? "1:1"
        : selectedFormats.includes("landscape")
        ? "16:9"
        : "4:5";

      const res = await fetch("/api/ai-scene/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          formats: selectedFormats,
          aspectRatio,
          imageStyle,
          overlayStyle,
          includeInfluencer: includeInfluencer && selectedInfluencerId ? selectedInfluencerId : null,
          overlayHeadline: overlayHeadline || undefined,
          overlaySubtext: overlaySubtext || undefined,
          saveToMediaLibrary: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate scene");
      }

      const newScene: GeneratedScene = {
        id: Date.now().toString(),
        images: data.images,
        prompt: prompt.trim(),
        imageStyle,
        overlayStyle,
        influencerId: includeInfluencer ? selectedInfluencerId : undefined,
        createdAt: new Date().toISOString(),
        savedToLibrary: true,
      };

      setScenes((prev) => [newScene, ...prev]);

      // Refresh saved assets
      if (data.savedAssets?.length > 0) {
        loadSavedAssets();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate scene");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToLibrary = async (scene: GeneratedScene) => {
    try {
      const entries = Object.entries(scene.images);
      for (const [format, url] of entries) {
        await fetch("/api/media-assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            thumbnailUrl: url,
            assetType: "ai_scene",
            aspectRatio: format === "square" ? "1:1" : format === "vertical" ? "9:16" : format === "landscape" ? "16:9" : "4:5",
            source: "flux",
            description: scene.prompt,
            aiMetadata: {
              prompt: scene.prompt,
              stylePreset: scene.imageStyle,
            },
            tags: ["ai-generated", "scene", format, ...(scene.influencerId ? ["influencer"] : [])],
          }),
        });
      }

      setScenes((prev) =>
        prev.map((s) => (s.id === scene.id ? { ...s, savedToLibrary: true } : s))
      );
      loadSavedAssets();
    } catch (err) {
      console.error("Failed to save to library:", err);
    }
  };

  const handleDeleteScene = (id: string) => {
    setScenes((prev) => prev.filter((s) => s.id !== id));
  };

  const selectedInfluencer = influencers.find((i) => i.id === selectedInfluencerId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">AI Scene Generator</h2>
        <p className="text-sm text-gray-500">
          Describe your scene and generate branded images with your AI influencers.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Controls Panel */}
        <div className="space-y-5 lg:col-span-1">
          {/* Prompt */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Scene Description
            </label>
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the scene you want to generate..."
                rows={4}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <button
                onClick={() => setShowPresets(!showPresets)}
                className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200"
              >
                <Sparkles className="h-3 w-3" />
                Presets
                <ChevronDown className={`h-3 w-3 transition-transform ${showPresets ? "rotate-180" : ""}`} />
              </button>
            </div>

            {/* Presets Dropdown */}
            {showPresets && (
              <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
                <div className="space-y-1">
                  {PROMPT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => {
                        setPrompt(preset);
                        setShowPresets(false);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Format Selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Format</label>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => toggleFormat(fmt.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    selectedFormats.includes(fmt.id)
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {fmt.icon}
                  <span>{fmt.label}</span>
                  <span className="ml-auto text-xs text-gray-400">{fmt.ratio}</span>
                  {selectedFormats.includes(fmt.id) && (
                    <Check className="h-3.5 w-3.5 text-purple-600" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Style Selector */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Style</label>
            <div className="grid grid-cols-3 gap-2">
              {STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setImageStyle(style.id)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    imageStyle === style.id
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Overlay Style */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Overlay Style</label>
            <div className="flex gap-2">
              {OVERLAY_STYLES.map((ovl) => (
                <button
                  key={ovl.id}
                  onClick={() => setOverlayStyle(ovl.id)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    overlayStyle === ovl.id
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {ovl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Influencer Toggle */}
          <div className="space-y-3 rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCircle className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Include AI Influencer</span>
              </div>
              <button
                onClick={() => setIncludeInfluencer(!includeInfluencer)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  includeInfluencer ? "bg-purple-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    includeInfluencer ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {includeInfluencer && (
              <div className="space-y-2">
                <select
                  value={selectedInfluencerId}
                  onChange={(e) => setSelectedInfluencerId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">Select an influencer...</option>
                  {influencers.map((inf) => (
                    <option key={inf.id} value={inf.id}>
                      {inf.name}
                    </option>
                  ))}
                </select>

                {selectedInfluencer && (
                  <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-2">
                    <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-gray-200">
                      {selectedInfluencer.baseImageUrl ? (
                        <Image
                          src={selectedInfluencer.baseImageUrl}
                          alt={selectedInfluencer.name}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <ImageIcon className="h-5 w-5 m-2.5 text-gray-400" />
                      )}
                    </div>
                    <div className="text-sm">
                      <p className="font-medium text-gray-900">{selectedInfluencer.name}</p>
                      <p className="text-xs text-gray-500">
                        {selectedInfluencer.gender}, {selectedInfluencer.ageRange}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Brand Color Preview */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Brand Color</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
              <div
                className="h-10 w-10 rounded-lg shadow-sm"
                style={{ backgroundColor: brandColor }}
              />
              <div className="text-sm">
                <p className="font-medium text-gray-900">Primary Brand Color</p>
                <p className="text-xs text-gray-500 font-mono">{brandColor}</p>
              </div>
            </div>
          </div>

          {/* Overlay Text (optional) */}
          {overlayStyle !== "none" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Overlay Text (Optional)</label>
              <input
                type="text"
                value={overlayHeadline}
                onChange={(e) => setOverlayHeadline(e.target.value)}
                placeholder="Headline text..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <input
                type="text"
                value={overlaySubtext}
                onChange={(e) => setOverlaySubtext(e.target.value)}
                placeholder="Subtext..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Generate Scene
              </>
            )}
          </button>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          {scenes.length === 0 && savedAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-20">
              <Wand2 className="mb-4 h-12 w-12 text-gray-300" />
              <p className="text-lg font-medium text-gray-400">No scenes yet</p>
              <p className="text-sm text-gray-400">
                Fill in the details and generate your first scene
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Generated Scenes */}
              {scenes.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">Generated Scenes</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {scenes.map((scene) => (
                      <SceneCard
                        key={scene.id}
                        scene={scene}
                        onSave={() => handleSaveToLibrary(scene)}
                        onDelete={() => handleDeleteScene(scene.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Saved Assets from Library */}
              {savedAssets.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">Media Library</h3>
                    <button
                      onClick={loadSavedAssets}
                      disabled={isLoadingAssets}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      <RefreshCw className={`h-3 w-3 ${isLoadingAssets ? "animate-spin" : ""}`} />
                      Refresh
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {savedAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white"
                      >
                        <div className="relative aspect-square bg-gray-100">
                          <Image
                            src={asset.thumbnailUrl || asset.url}
                            alt={asset.description || "AI scene"}
                            fill
                            className="object-cover"
                            sizes="200px"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                            <a
                              href={asset.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm">
                                <Download className="h-4 w-4 text-gray-700" />
                              </div>
                            </a>
                          </div>
                        </div>
                        <div className="p-2">
                          <p className="truncate text-xs text-gray-600">
                            {asset.description || "AI Scene"}
                          </p>
                          <div className="mt-1 flex items-center gap-1">
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 uppercase">
                              {asset.aspectRatio}
                            </span>
                            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 uppercase">
                              {asset.source}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Scene Card
// ============================================================
function SceneCard({
  scene,
  onSave,
  onDelete,
}: {
  scene: GeneratedScene;
  onSave: () => void;
  onDelete: () => void;
}) {
  const [selectedFormat, setSelectedFormat] = useState(
    Object.keys(scene.images)[0] || "square"
  );

  const currentImage = scene.images[selectedFormat];
  const formats = Object.keys(scene.images);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="relative aspect-square bg-gray-100">
        {currentImage ? (
          <Image
            src={currentImage}
            alt="Generated scene"
            fill
            className="object-cover"
            sizes="400px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <ImageIcon className="h-12 w-12" />
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          {formats.map((fmt) => (
            <button
              key={fmt}
              onClick={() => setSelectedFormat(fmt)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                selectedFormat === fmt
                  ? "bg-purple-100 text-purple-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-700 line-clamp-2">{scene.prompt}</p>

        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 capitalize">{scene.imageStyle}</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 capitalize">{scene.overlayStyle}</span>
          {scene.influencerId && (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-600">Influencer</span>
          )}
        </div>

        <div className="flex gap-2">
          {!scene.savedToLibrary && (
            <button
              onClick={onSave}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save to Library
            </button>
          )}
          {scene.savedToLibrary && (
            <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-50 py-2 text-xs font-medium text-green-700">
              <Check className="h-3.5 w-3.5" />
              Saved
            </div>
          )}
          <button
            onClick={onDelete}
            className="flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

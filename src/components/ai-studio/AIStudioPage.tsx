"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Wand2,
  ImageIcon,
  UserCircle,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Download,
  AlertCircle,
} from "lucide-react";
import { AIInfluencerGallery } from "@/components/ai-studio/AIInfluencerGallery";
import { InfluencerCreationWizard } from "@/components/ai-studio/InfluencerCreationWizard";
import { AISceneGenerator } from "@/components/ai-studio/AISceneGenerator";
import type { AIInfluencer, MediaAsset } from "@/types/v2";

interface AIStudioPageProps {
  influencers: AIInfluencer[];
}

export function AIStudioPage({ influencers: initialInfluencers }: AIStudioPageProps) {
  const [activeTab, setActiveTab] = useState<"influencers" | "scenes" | "assets">("influencers");
  const [influencers, setInfluencers] = useState<AIInfluencer[]>(initialInfluencers);
  const [showWizard, setShowWizard] = useState(false);
  const [editingInfluencer, setEditingInfluencer] = useState<AIInfluencer | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    setIsLoadingAssets(true);
    setAssetsError(null);
    try {
      const res = await fetch("/api/media-assets?assetType=ai_scene&limit=50");
      const data = await res.json();
      if (res.ok) {
        setAssets(data.items || []);
      } else {
        setAssetsError(data.error || "Failed to load assets");
      }
    } catch (err) {
      setAssetsError("Failed to load assets");
    } finally {
      setIsLoadingAssets(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "assets") {
      loadAssets();
    }
  }, [activeTab, loadAssets]);

  const handleCreateInfluencer = () => {
    setEditingInfluencer(null);
    setShowWizard(true);
  };

  const handleEditInfluencer = (influencer: AIInfluencer) => {
    setEditingInfluencer(influencer);
    setShowWizard(true);
  };

  const handleSaveInfluencer = (saved: AIInfluencer) => {
    setInfluencers((prev) => {
      const exists = prev.find((i) => i.id === saved.id);
      if (exists) {
        return prev.map((i) => (i.id === saved.id ? saved : i));
      }
      return [saved, ...prev];
    });
    setShowWizard(false);
    setEditingInfluencer(null);
  };

  const handleDeleteInfluencer = async (id: string) => {
    if (!confirm("Are you sure you want to delete this influencer?")) return;
    try {
      const res = await fetch(`/api/ai-influencers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setInfluencers((prev) => prev.filter((i) => i.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete influencer:", err);
    }
  };

  const handleGenerateSceneWithInfluencer = (_id: string) => {
    setActiveTab("scenes");
  };

  const tabs = [
    { id: "influencers" as const, label: "Influencers", icon: UserCircle },
    { id: "scenes" as const, label: "Scene Generator", icon: Wand2 },
    { id: "assets" as const, label: "My Assets", icon: ImageIcon },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Studio</h1>
        <p className="text-sm text-gray-500">
          Create AI influencers, generate scenes, and craft custom visuals for your content.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors sm:flex-none ${
                activeTab === tab.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Influencers Tab */}
      {activeTab === "influencers" && (
        <AIInfluencerGallery
          influencers={influencers}
          onCreate={handleCreateInfluencer}
          onEdit={handleEditInfluencer}
          onDelete={handleDeleteInfluencer}
          onGenerateScene={handleGenerateSceneWithInfluencer}
        />
      )}

      {/* Scene Generator Tab */}
      {activeTab === "scenes" && (
        <AISceneGenerator
          influencers={influencers}
          brandColor="#864FFE"
        />
      )}

      {/* My Assets Tab */}
      {activeTab === "assets" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">My Assets</h2>
              <p className="text-sm text-gray-500">
                AI-generated scenes and images from your media library
              </p>
            </div>
            <button
              onClick={loadAssets}
              disabled={isLoadingAssets}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingAssets ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {assetsError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {assetsError}
            </div>
          )}

          {isLoadingAssets ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              <p className="mt-2 text-sm text-gray-500">Loading assets...</p>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-20">
              <LayoutGrid className="mb-4 h-12 w-12 text-gray-300" />
              <p className="text-lg font-medium text-gray-400">No AI assets yet</p>
              <p className="text-sm text-gray-400">
                Generate scenes in the Scene Generator tab to see them here
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-lg"
                >
                  <div className="relative aspect-square bg-gray-100">
                    <Image
                      src={asset.thumbnailUrl || asset.url}
                      alt={asset.description || "AI asset"}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 20vw"
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
                  <div className="p-3">
                    <p className="truncate text-sm text-gray-900">
                      {asset.description || "AI Scene"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {asset.aspectRatio && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 uppercase">
                          {asset.aspectRatio}
                        </span>
                      )}
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 uppercase">
                        {asset.source}
                      </span>
                      {asset.width && asset.height && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          {asset.width}×{asset.height}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400">
                      {new Date(asset.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Wizard Modal */}
      {showWizard && (
        <InfluencerCreationWizard
          influencer={editingInfluencer}
          onSave={handleSaveInfluencer}
          onCancel={() => {
            setShowWizard(false);
            setEditingInfluencer(null);
          }}
        />
      )}
    </div>
  );
}

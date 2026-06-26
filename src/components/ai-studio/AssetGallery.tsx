"use client";

import React from "react";
import Image from "next/image";
import { Play, Wand2 } from "lucide-react";

import type { MediaAsset } from "@/types/v2";

interface AssetGalleryProps {
  assets: MediaAsset[];
  mode: "image" | "video";
  onUseImage?: (asset: MediaAsset) => void;
  onAnimate?: (asset: MediaAsset) => void;
  loading?: boolean;
}

export function AssetGallery({ assets, mode, onUseImage, onAnimate, loading }: AssetGalleryProps) {
  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 w-32 shrink-0 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-400">
          Your generated {mode === "image" ? "images" : "videos"} will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {assets.map((asset) => (
        <AssetThumb
          key={asset.id}
          asset={asset}
          mode={mode}
          onUse={onUseImage}
          onAnimate={onAnimate}
        />
      ))}
    </div>
  );
}

function AssetThumb({
  asset,
  mode,
  onUse,
  onAnimate,
}: {
  asset: MediaAsset;
  mode: "image" | "video";
  onUse?: (asset: MediaAsset) => void;
  onAnimate?: (asset: MediaAsset) => void;
}) {
  const isVideo = mode === "video" || asset.assetType.includes("video");

  return (
    <div className="group relative shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="relative h-36 w-32 bg-gray-100 sm:h-40 sm:w-36">
        <Image
          src={asset.thumbnailUrl || asset.url}
          alt={asset.description || "Asset"}
          fill
          className="object-cover"
          sizes="150px"
        />
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
              <Play className="h-4 w-4 fill-white" />
            </div>
          </div>
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          {mode === "image" && onAnimate && (
            <button
              onClick={() => onAnimate(asset)}
              className="flex items-center gap-1 rounded-full bg-purple-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-purple-700"
            >
              <Wand2 className="h-3 w-3" />
              Animate
            </button>
          )}
          <button
            onClick={() => onUse?.(asset)}
            className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-900 shadow-sm hover:bg-gray-100"
          >
            Use this {mode === "image" ? "image" : "video"}
          </button>
        </div>
      </div>
    </div>
  );
}

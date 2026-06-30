"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ImageIcon } from "lucide-react";
interface MediaAsset {
  publicId: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  isImage: boolean;
  isVideo: boolean;
}

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  title?: string;
}

export function MediaPickerModal({
  open,
  onClose,
  onSelect,
  title = "Select from Media Library",
}: MediaPickerModalProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loadRef = useRef(false);

  const fetchMedia = useCallback(async (query?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: "image", limit: "60" });
      if (query?.trim()) params.set("search", query.trim());
      const res = await fetch(`/api/media-library?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
      }
    } catch (err) {
      console.error("Failed to load media library", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !loadRef.current) {
      loadRef.current = true;
      fetchMedia();
    }
    if (!open) {
      loadRef.current = false;
      setSelectedId(null);
      setSearch("");
    }
  }, [open, fetchMedia]);

  const handleConfirm = () => {
    if (!selectedId) return;
    const asset = assets.find((a) => a.publicId === selectedId);
    if (asset) {
      onSelect(asset.url);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search media..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchMedia(search);
            }}
            className="pl-9"
          />
        </div>

        {/* Grid */}
        <div className="min-h-[300px] flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="size-8 opacity-40" />
              <p>No media found in your library.</p>
              <p className="text-xs">Upload images using the Media Library page first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
              {assets.map((asset) => {
                const isSelected = asset.publicId === selectedId;
                return (
                  <button
                    key={asset.publicId}
                    type="button"
                    onClick={() =>
                      setSelectedId(isSelected ? null : asset.publicId)
                    }
                    className={`group relative aspect-[9/16] overflow-hidden rounded-lg border bg-muted transition-all ${
                      isSelected
                        ? "border-blue-500 ring-2 ring-blue-500/40"
                        : "border-border hover:border-blue-300"
                    }`}
                  >
                    <Image
                      src={asset.thumbnailUrl || asset.url}
                      alt={asset.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 25vw, 20vw"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-blue-500/10" />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                      <p className="truncate text-[10px] text-white">
                        {asset.name}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedId}>
            Use Selected
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

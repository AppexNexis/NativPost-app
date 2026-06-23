'use client';

import { ExternalLink, ImageIcon, Library, Loader2, Trash2, Video } from 'lucide-react';
import { CldImage, CldUploadWidget } from 'next-cloudinary';
import { useState } from 'react';

import { MediaPicker } from '@/components/media/MediaPicker';

type MediaUploaderProps = {
  contentItemId: string;
  existingUrls: string[];
  onUpdate: (urls: string[]) => void;
  mediaType?: 'image' | 'video' | 'any';
  maxFiles?: number;
};

// Simple check for Cloudinary resource types or fallback extensions
function isVideoUrl(url: string): boolean {
  return url.includes('/video/upload/') || /\.(?:mp4|mov|webm|avi|mkv)(?:[/?#]|$)/i.test(url);
}

export function MediaUploader({
  contentItemId,
  existingUrls,
  onUpdate,
  mediaType = 'image',
  maxFiles,
}: MediaUploaderProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const atMaxFiles = maxFiles !== undefined && existingUrls.length >= maxFiles;
  const isVideoMode = mediaType === 'video';
  const Icon = isVideoMode ? Video : ImageIcon;

  const saveUrls = async (merged: string[]) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphicUrls: merged }),
      });
      if (!res.ok) {
        throw new Error('Failed to save');
      }
      onUpdate(merged);
    } catch {
      setError('Failed to save media. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadSuccess = async (result: any) => {
    if (!result?.info?.secure_url) return;
    
    const newUrl = result.info.secure_url;
    const merged = maxFiles === 1 ? [newUrl] : [...existingUrls, newUrl];
    await saveUrls(merged);
  };

  const handlePickerSelect = async (selectedUrls: string[]) => {
    if (selectedUrls.length === 0) return;
    const merged = maxFiles === 1
      ? selectedUrls
      : [...existingUrls, ...selectedUrls].slice(0, maxFiles ?? Infinity);
    await saveUrls(merged);
  };

  const removeMedia = async (urlToRemove: string) => {
    const updated = existingUrls.filter(u => u !== urlToRemove);
    await saveUrls(updated);
  };

  const pickerAccept = mediaType === 'video' ? 'video' : mediaType === 'image' ? 'image' : 'all';
  const remainingSlots = maxFiles !== undefined ? maxFiles - existingUrls.length : undefined;

  return (
    <div className="space-y-4">
      {/* Media picker modal */}
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        multiple={!isVideoMode && maxFiles !== 1}
        accept={pickerAccept as 'image' | 'video' | 'all'}
        maxSelect={remainingSlots}
        title={isVideoMode ? 'Select video from library' : 'Select from media library'}
      />

      {/* Existing media previews with on-the-fly Cloudinary Enhancement */}
      {existingUrls.length > 0 && (
        <div className={isVideoMode ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}>
          {existingUrls.map((url, i) => {
            const isVid = isVideoMode || isVideoUrl(url);

            return (
              <div
                key={url}
                className="group relative overflow-hidden rounded-lg border bg-muted/30"
              >
                {isVid ? (
                  <div className="relative aspect-video w-full bg-black">
                    <video
                      src={url}
                      className="size-full object-contain"
                      controls
                      preload="metadata"
                      playsInline
                    />
                  </div>
                ) : (
                  <div className="relative aspect-video w-full">
                    {/* CldImage intercepts the url, optimizes format, scales smartly,
                      and applies the dynamic AI color/contrast enhancement parameter automatically.
                    */}
                    <CldImage
                      src={url}
                      alt={`Enhanced Image ${i + 1}`}
                      fill
                      className="object-cover"
                      enhance={true}
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  </div>
                )}

                {/* Overlay controls */}
                <div className="absolute right-2 top-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100/100 z-10">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                    title="View full size"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => removeMedia(url)}
                    disabled={isSaving}
                    className="flex size-7 items-center justify-center rounded-full bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-60"
                    title="Remove"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                {!isVid && (
                  <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white z-10">
                    {i + 1}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload area using next-cloudinary wrapper */}
      {!atMaxFiles && (
        <div className="space-y-2">
          {isSaving && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Saving...
            </div>
          )}

          <CldUploadWidget
            onSuccess={handleUploadSuccess}
            uploadPreset={process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET}
            options={{
              maxFiles: maxFiles,
              clientAllowedFormats: isVideoMode ? ['mp4', 'mov', 'webm'] : ['png', 'jpg', 'jpeg', 'webp', 'avif'],
              sources: ['local', 'url', 'dropbox', 'google_drive', 'instagram'],
              multiple: !isVideoMode && maxFiles !== 1,
            }}
          >
            {({ open }) => (
              <div 
                onClick={() => open()}
                className="rounded-lg border-2 border-dashed border-border/60 bg-muted/20 transition-colors hover:border-primary/40 hover:bg-muted/40 cursor-pointer"
              >
                <div className="flex flex-col items-center gap-2 p-6 text-center">
                  <Icon className="size-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">
                    {isVideoMode ? (existingUrls.length === 0 ? 'Upload video' : 'Replace video') : 'Upload studio-quality images'}
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    {isVideoMode ? 'MP4, MOV, or WebM' : 'Supports raw photos and automatic high-definition optimization'}
                  </p>
                </div>
              </div>
            )}
          </CldUploadWidget>

          {/* Select from library button */}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Library className="size-4" />
            Select from media library
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
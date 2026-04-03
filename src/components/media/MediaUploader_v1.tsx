'use client';

import '@uploadcare/react-uploader/core.css';

import { FileUploaderRegular } from '@uploadcare/react-uploader/next';
import { ExternalLink, ImageIcon, Library, Loader2, Trash2, Video } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { MediaPicker } from '@/components/media/MediaPicker';

type MediaUploaderProps = {
  contentItemId: string;
  existingUrls: string[];
  onUpdate: (urls: string[]) => void;
  mediaType?: 'image' | 'video' | 'any';
  maxFiles?: number;
};

function isVideoUrl(url: string): boolean {
  return /\.(?:mp4|mov|webm|avi|mkv)(?:[/?#]|$)/i.test(url)
    || url.includes('video')
    || url.includes('.mp4');
}

function toPlayableVideoSrc(url: string): string {
  if (/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(url)) {
    return url;
  }
  const base = url.endsWith('/') ? url : `${url}/`;
  return `${base}video.mp4`;
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

  const pubkey = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY;

  if (!pubkey) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Media upload is not configured.
          {' '}
          <span className="font-medium">Add NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY to your .env</span>
        </p>
      </div>
    );
  }

  const atMaxFiles = maxFiles !== undefined && existingUrls.length >= maxFiles;
  const isVideoMode = mediaType === 'video';
  const Icon = isVideoMode ? Video : ImageIcon;

  const saveUrls = async (urls: string[]) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphicUrls: urls }),
      });
      if (!res.ok) {
        throw new Error('Failed to save');
      }
      onUpdate(urls);
    } catch {
      setError('Failed to save media. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadComplete = async (files: { cdnUrl: string | null }[]) => {
    const newUrls = files
      .map(f => f.cdnUrl)
      .filter((url): url is string => url !== null);
    if (newUrls.length === 0) {
      return;
    }
    const merged = maxFiles === 1 ? newUrls : [...existingUrls, ...newUrls];
    await saveUrls(merged);
  };

  const handlePickerSelect = async (urls: string[]) => {
    if (urls.length === 0) {
      return;
    }
    const merged = maxFiles === 1 ? urls : [...existingUrls, ...urls];
    await saveUrls(merged);
  };

  const removeMedia = async (urlToRemove: string) => {
    const updated = existingUrls.filter(u => u !== urlToRemove);
    await saveUrls(updated);
  };

  const uploaderConfig = {
    image: {
      imgOnly: true,
      accept: 'image/*',
      sourceList: 'local, url, camera, dropbox, gdrive, instagram, unsplash',
      useCloudImageEditor: true,
    },
    video: {
      imgOnly: false,
      accept: 'video/mp4,video/quicktime,video/webm',
      sourceList: 'local, url, dropbox, gdrive',
      useCloudImageEditor: false,
    },
    any: {
      imgOnly: false,
      accept: 'image/*,video/mp4,video/quicktime,video/webm',
      sourceList: 'local, url, camera, dropbox, gdrive, instagram',
      useCloudImageEditor: false,
    },
  }[mediaType];

  const uploadLabel = () => {
    if (isVideoMode) {
      return existingUrls.length === 0 ? 'Upload your video' : 'Replace video';
    }
    return existingUrls.length === 0 ? 'Add an image to this post' : 'Add more images';
  };

  const uploadHint = () => {
    if (isVideoMode) {
      return 'MP4, MOV, or WebM · Max 500MB · Upload from your computer, Drive, or Dropbox';
    }
    return 'Upload from your computer, URL, Unsplash, Google Drive, Dropbox, or Instagram';
  };

  const pickerAccept = isVideoMode ? 'video' : mediaType === 'any' ? 'all' : 'image';

  return (
    <div className="space-y-4">
      {/* Media picker modal */}
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        multiple={!isVideoMode && maxFiles !== 1}
        accept={pickerAccept as 'image' | 'video' | 'all'}
        title={isVideoMode ? 'Select video from library' : 'Select images from library'}
      />

      {/* Existing media previews */}
      {existingUrls.length > 0 && (
        <div className={isVideoMode ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}>
          {existingUrls.map((url, i) => {
            const isVid = isVideoMode || isVideoUrl(url);
            const videoSrc = isVid ? toPlayableVideoSrc(url) : url;

            return (
              <div
                key={url}
                className="group relative overflow-hidden rounded-lg border bg-muted/30"
              >
                {isVid ? (
                  <div className="relative aspect-video w-full bg-black">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={videoSrc}
                      className="size-full object-contain"
                      controls
                      preload="metadata"
                      playsInline
                    />
                  </div>
                ) : (
                  <div className="relative aspect-video w-full">
                    <Image
                      src={url}
                      alt={`Image ${i + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}

                {/* Overlay controls */}
                <div className="absolute right-2 top-2 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <a
                    href={isVid ? videoSrc : url}
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

                {/* Number badge (images only) */}
                {!isVid && (
                  <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                    {i + 1}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload widget + library picker */}
      {!atMaxFiles && (
        <div className="space-y-2">
          <div className="relative">
            {isSaving && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
            )}

            <div className="rounded-lg border-2 border-dashed border-border/60 bg-muted/20 transition-colors hover:border-primary/40 hover:bg-muted/40">
              <div className="flex flex-col items-center gap-2 p-4 text-center">
                <Icon className="size-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">{uploadLabel()}</p>
                <p className="text-xs text-muted-foreground/60">{uploadHint()}</p>
              </div>

              <FileUploaderRegular
                pubkey={pubkey}
                multiple={!isVideoMode && maxFiles !== 1}
                imgOnly={uploaderConfig.imgOnly}
                accept={uploaderConfig.accept}
                sourceList={uploaderConfig.sourceList}
                useCloudImageEditor={uploaderConfig.useCloudImageEditor}
                onDoneClick={(files) => {
                  const uploaded = files.allEntries
                    .filter(f => f.status === 'success')
                    .map(f => ({ cdnUrl: (f as any).cdnUrl as string | null }));
                  handleUploadComplete(uploaded);
                }}
                classNameUploader="uc-light"
                className="w-full"
              />
            </div>
          </div>

          {/* Select from library button */}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            <Library className="size-3.5" />
            Select from library
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {existingUrls.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {isVideoMode
            ? 'Video attached. This will be published to all selected platforms.'
            : existingUrls.length === 1
              ? '1 image attached. This will be used when publishing.'
              : `${existingUrls.length} images attached. All used for carousel posts.`}
        </p>
      )}
    </div>
  );
}

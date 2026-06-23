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

// A URL is a video if it has a video file extension.
// Bare Uploadcare CDN URLs (no extension) are images.
// Video URLs uploaded through the video uploader are always
// normalized to include /video.mp4 before saving, so this
// check is reliable.
function isVideoUrl(url: string): boolean {
  return /\.(?:mp4|mov|webm|avi|mkv)(?:[/?#]|$)/i.test(url);
}

// Ensures a video URL is directly playable by the browser.
// Bare Uploadcare URLs like https://cdn.ucarecd.net/uuid/ become
// https://cdn.ucarecd.net/uuid/video.mp4
function toPlayableVideoSrc(url: string): string {
  if (/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(url)) {
    return url;
  }
  const base = url.endsWith('/') ? url : `${url}/`;
  return `${base}video.mp4`;
}

// Normalizes a CDN URL returned by the Uploadcare widget.
// For video uploads, appends /video.mp4 so the URL is
// identifiable as a video without needing MIME type checks.
function normalizeUploadedUrl(cdnUrl: string, isVideo: boolean): string {
  if (!isVideo) {
    return cdnUrl;
  }
  // Already has a video extension — return as-is
  if (/\.(?:mp4|mov|webm|avi|mkv)(?:[/?#]|$)/i.test(cdnUrl)) {
    return cdnUrl;
  }
  // Bare CDN URL — append /video.mp4
  const base = cdnUrl.endsWith('/') ? cdnUrl : `${cdnUrl}/`;
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

  const handleUploadComplete = async (files: { cdnUrl: string | null }[]) => {
    const newUrls = files
      .map(f => f.cdnUrl)
      .filter((url): url is string => url !== null)
      // Normalize video URLs so they are always identifiable by extension
      .map(url => normalizeUploadedUrl(url, isVideoMode));

    if (newUrls.length === 0) {
      return;
    }
    // For video (maxFiles=1), replace entirely. For images, append.
    const merged = maxFiles === 1 ? newUrls : [...existingUrls, ...newUrls];
    await saveUrls(merged);
  };

  const handlePickerSelect = async (selectedUrls: string[]) => {
    if (selectedUrls.length === 0) {
      return;
    }
    const merged = maxFiles === 1
      ? selectedUrls
      : [...existingUrls, ...selectedUrls].slice(0, maxFiles ?? Infinity);
    await saveUrls(merged as string[]);
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

  const pickerAccept = mediaType === 'video' ? 'video' : mediaType === 'image' ? 'image' : 'all';
  const remainingSlots = maxFiles !== undefined ? maxFiles - existingUrls.length : undefined;

  const uploadLabel = () => {
    if (isVideoMode) {
      return existingUrls.length === 0 ? 'Upload your video' : 'Replace video';
    }
    return existingUrls.length === 0 ? 'Add an image' : 'Add more images';
  };

  const uploadHint = () => {
    if (isVideoMode) {
      return 'MP4, MOV, or WebM up to 500 MB';
    }
    return 'Upload from your computer, Unsplash, Google Drive, Dropbox, or Instagram';
  };

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

      {/* Existing media previews */}
      {existingUrls.length > 0 && (
        <div className={isVideoMode ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}>
          {existingUrls.map((url, i) => {
            // In video mode every item is a video regardless of URL shape.
            // In image/any mode, check by extension.
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

                {/* Number badge for images */}
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

      {/* Upload and library selection area */}
      {!atMaxFiles && (
        <div className="space-y-2">
          {isSaving && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Saving...
            </div>
          )}

          {/* Uploadcare widget */}
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
                  .map(f => ({ cdnUrl: (f as { cdnUrl?: string | null }).cdnUrl ?? null }));
                handleUploadComplete(uploaded);
              }}
              classNameUploader="uc-light"
              className="w-full"
            />
          </div>

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

      {existingUrls.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {isVideoMode
            ? 'Video attached. This will be published to all selected platforms.'
            : existingUrls.length === 1
              ? '1 image attached.'
              : `${existingUrls.length} images attached.`}
        </p>
      )}
    </div>
  );
}

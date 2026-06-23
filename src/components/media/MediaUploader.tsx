'use client';

/**
 * MediaUploader — Cloudinary replacement for the Uploadcare-based uploader.
 *
 * Key changes from the Uploadcare version:
 * 1. Uses CldUploadWidget (next-cloudinary) with SIGNED uploads via /api/media-library/signature
 * 2. Saves Cloudinary public_id instead of Uploadcare CDN URL
 * 3. Renders previews with CldImage (AI-enhanced: e_enhance, q_auto, f_auto)
 * 4. Shows a category-tagging confirmation modal after upload (beats Fastlane)
 * 5. Video thumbnails use Cloudinary video transformation URLs
 *
 * Data model change:
 *   Before: graphicUrls[] stored full Uploadcare CDN URLs
 *   After:  graphicUrls[] stores Cloudinary public_ids
 *           (CldImage / cldVideoSrc() build the actual delivery URL at render time)
 */

import { ExternalLink, ImageIcon, Library, Loader2, Trash2, Video } from 'lucide-react';
import { CldImage, CldUploadWidget, type CloudinaryUploadWidgetOptions } from 'next-cloudinary';
import { useState } from 'react';

import { MediaPicker } from '@/components/media/MediaPicker';
import { UploadCategoryModal } from './UploadCategoryModal';
import { cldVideoSrc, cldVideoThumbnail } from '@/lib/cloudflare-helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PendingUpload = {
  publicId: string;
  resourceType: 'image' | 'video';
  thumbnailUrl: string;
  originalFilename: string;
};

type MediaUploaderProps = {
  contentItemId: string;
  existingPublicIds: string[];          // ← was: existingUrls (Uploadcare CDN URLs)
  onUpdate: (publicIds: string[]) => void;
  mediaType?: 'image' | 'video' | 'any';
  maxFiles?: number;
};

function isVideoPublicId(publicId: string, resourceType?: string): boolean {
  if (resourceType === 'video') return true;
  return /\.(mp4|mov|webm|avi|mkv)$/i.test(publicId);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MediaUploader({
  contentItemId,
  existingPublicIds,
  onUpdate,
  mediaType = 'image',
  maxFiles,
}: MediaUploaderProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Category tagging modal state
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);

  const atMaxFiles = maxFiles !== undefined && existingPublicIds.length >= maxFiles;
  const isVideoMode = mediaType === 'video';
  const Icon = isVideoMode ? Video : ImageIcon;

  // ---------------------------------------------------------------------------
  // Save public IDs to DB via PATCH /api/content/[id]
  // ---------------------------------------------------------------------------
  const savePublicIds = async (merged: string[]) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphicUrls: merged }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onUpdate(merged);
    } catch {
      setError('Failed to save media. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Cloudinary Upload Widget callback
  // Called when the widget closes after a successful upload.
  // We don't save yet — we show the category tagging modal first.
  // ---------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleUploadSuccess = (result: any) => {
    const info = result?.info;
    if (!info?.public_id) return;

    const resourceType: 'image' | 'video' =
      info.resource_type === 'video' ? 'video' : 'image';

    const thumbnailUrl =
      resourceType === 'video'
        ? cldVideoThumbnail(info.public_id, 200)
        : `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/c_fill,w_200,h_200,q_auto,f_webp/${info.public_id}`;

    // Show the category tagging modal before saving
    setPendingUpload({
      publicId: info.public_id,
      resourceType,
      thumbnailUrl,
      originalFilename: info.original_filename ?? info.public_id.split('/').pop() ?? '',
    });
  };

  // Called when user confirms categories in the modal
  const handleCategoryConfirm = async (categories: string[]) => {
    if (!pendingUpload) return;

    // Save categories to Cloudinary context
    if (categories.length > 0) {
      await fetch(
        `/api/media-library/${encodeURIComponent(pendingUpload.publicId)}/categories`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categories,
            resourceType: pendingUpload.resourceType,
          }),
        },
      );
    }

    // Merge into existing list and save to content item
    const merged =
      maxFiles === 1
        ? [pendingUpload.publicId]
        : [...existingPublicIds, pendingUpload.publicId];
    await savePublicIds(merged);
    setPendingUpload(null);
  };

  const handleCategorySkip = async () => {
    if (!pendingUpload) return;
    const merged =
      maxFiles === 1
        ? [pendingUpload.publicId]
        : [...existingPublicIds, pendingUpload.publicId];
    await savePublicIds(merged);
    setPendingUpload(null);
  };

  // ---------------------------------------------------------------------------
  // Media Picker (select from existing library)
  // ---------------------------------------------------------------------------
  const handlePickerSelect = async (selectedPublicIds: string[]) => {
    if (selectedPublicIds.length === 0) return;
    const merged =
      maxFiles === 1
        ? selectedPublicIds
        : [...existingPublicIds, ...selectedPublicIds].slice(0, maxFiles ?? Infinity);
    await savePublicIds(merged as string[]);
  };

  const removeMedia = async (publicIdToRemove: string) => {
    const updated = existingPublicIds.filter(id => id !== publicIdToRemove);
    await savePublicIds(updated);
  };

  const pickerAccept = mediaType === 'video' ? 'video' : mediaType === 'image' ? 'image' : 'all';
  const remainingSlots = maxFiles !== undefined ? maxFiles - existingPublicIds.length : undefined;

  const uploadLabel = () => {
    if (isVideoMode) return existingPublicIds.length === 0 ? 'Upload your video' : 'Replace video';
    return existingPublicIds.length === 0 ? 'Add an image' : 'Add more images';
  };

  const uploadHint = () => {
    if (isVideoMode) return 'MP4, MOV, or WebM · AI-enhanced on delivery';
    return 'Upload from your computer, Unsplash, Google Drive, Dropbox, or Instagram';
  };

  // ---------------------------------------------------------------------------
  // Cloudinary widget options
  // ---------------------------------------------------------------------------
  const widgetSources: CloudinaryUploadWidgetOptions['sources'] = isVideoMode
    ? ['local', 'url', 'dropbox', 'google_drive']
    : ['local', 'url', 'camera', 'dropbox', 'google_drive', 'instagram', 'unsplash'];

  const widgetOptions: CloudinaryUploadWidgetOptions = {
    sources: widgetSources,
    multiple: false,
    resourceType: isVideoMode ? 'video' : 'image',
    clientAllowedFormats: isVideoMode
      ? ['mp4', 'mov', 'webm']
      : ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'],
    maxFileSize: isVideoMode ? 500_000_000 : 20_000_000,
    cropping: false,
    showSkipCropButton: true,
    styles: {
      palette: {
        window: '#FFFFFF',
        windowBorder: '#E5E7EB',
        tabIcon: '#F97316',
        menuIcons: '#6B7280',
        textDark: '#111827',
        textLight: '#FFFFFF',
        link: '#F97316',
        action: '#F97316',
        inactiveTabIcon: '#9CA3AF',
        error: '#EF4444',
        inProgress: '#F97316',
        complete: '#10B981',
        sourceBg: '#F9FAFB',
      },
    },
  };
  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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

      {/* Category tagging modal — appears after upload */}
      {pendingUpload && (
        <UploadCategoryModal
          upload={pendingUpload}
          isVideo={pendingUpload.resourceType === 'video'}
          onConfirm={handleCategoryConfirm}
          onSkip={handleCategorySkip}
        />
      )}

      {/* Existing media previews */}
      {existingPublicIds.length > 0 && (
        <div className={isVideoMode ? 'space-y-3' : 'grid gap-3 sm:grid-cols-2'}>
          {existingPublicIds.map((publicId, i) => {
            const isVid = isVideoMode || isVideoPublicId(publicId);

            return (
              <div
                key={publicId}
                className="group relative overflow-hidden rounded-lg border bg-muted/30"
              >
                {isVid ? (
                  <div className="relative aspect-video w-full bg-black">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={cldVideoSrc(publicId)}
                      poster={cldVideoThumbnail(publicId, 800)}
                      className="size-full object-contain"
                      controls
                      preload="metadata"
                      playsInline
                    />
                  </div>
                ) : (
                  <div className="relative aspect-video w-full">
                    {/*
                      CldImage applies AI enhancement on the fly:
                      e_enhance → AI color/contrast fix
                      q_auto    → optimal compression
                      f_auto    → AVIF/WebP for modern browsers
                    */}
                    <CldImage
                      src={publicId}
                      alt={`Media ${i + 1}`}
                      fill
                      className="object-cover"
                      enhance
                      quality="auto"
                      format="auto"
                      sizes="(max-width: 640px) 100vw, 50vw"
                    />
                  </div>
                )}

                {/* Overlay controls */}
                <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <a
                    href={isVid ? cldVideoSrc(publicId) : `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/${publicId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                    title="View full size"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => removeMedia(publicId)}
                    disabled={isSaving}
                    className="flex size-7 items-center justify-center rounded-full bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-60"
                    title="Remove"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                {!isVid && (
                  <div className="absolute left-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                    {i + 1}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Upload area */}
      {!atMaxFiles && (
        <div className="space-y-2">
          {isSaving && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Saving...
            </div>
          )}

          <CldUploadWidget
            signatureEndpoint="/api/media-library/signature"
            onSuccess={handleUploadSuccess}
            onError={(error) => {
              console.log(error);
            }}
            options={widgetOptions}
          >
            {({ open }) => (
              <div
                onClick={() => open()}
                className="cursor-pointer rounded-lg border-2 border-dashed border-border/60 bg-muted/20 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <div className="flex flex-col items-center gap-2 p-6 text-center">
                  <Icon className="size-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-muted-foreground">{uploadLabel()}</p>
                  <p className="text-xs text-muted-foreground/60">{uploadHint()}</p>
                  {!isVideoMode && (
                    <span className="mt-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-[10px] font-medium text-orange-600 ring-1 ring-orange-200">
                      ✦ AI-enhanced on delivery
                    </span>
                  )}
                </div>
              </div>
            )}
          </CldUploadWidget>

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

      {existingPublicIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {isVideoMode
            ? 'Video attached. Will be published to all selected platforms.'
            : existingPublicIds.length === 1
              ? '1 image attached.'
              : `${existingPublicIds.length} images attached.`}
        </p>
      )}
    </div>
  );
}
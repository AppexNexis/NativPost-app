'use client';

import '@uploadcare/react-uploader/core.css';

import { FileUploaderRegular } from '@uploadcare/react-uploader/next';
import { ExternalLink, ImageIcon, Loader2, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

type MediaUploaderProps = {
  contentItemId: string;
  existingUrls: string[];
  onUpdate: (urls: string[]) => void;
};

export function MediaUploader({ contentItemId, existingUrls, onUpdate }: MediaUploaderProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line no-console
  console.log({ contentItemId, existingUrls, onUpdate });

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

  const handleUploadComplete = async (files: { cdnUrl: string | null }[]) => {
    const newUrls = files
      .map(f => f.cdnUrl)
      .filter((url): url is string => url !== null);

    if (newUrls.length === 0) {
      return;
    }

    // Merge with existing (for carousel multi-image)
    const merged = [...existingUrls, ...newUrls];

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
      setError('Failed to save image. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeImage = async (urlToRemove: string) => {
    const updated = existingUrls.filter(u => u !== urlToRemove);

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/content/${contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphicUrls: updated }),
      });

      if (!res.ok) {
        throw new Error('Failed to save');
      }

      onUpdate(updated);
    } catch {
      setError('Failed to remove image. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing images */}
      {existingUrls.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {existingUrls.map((url, i) => (
            <div key={url} className="group relative overflow-hidden rounded-lg border bg-muted/30">
              {/* Preview */}
              <div className="relative aspect-video w-full">
                <Image
                  src={url}
                  alt={`Image ${i + 1}`}
                  fill
                  className="object-cover"
                  unoptimized // Uploadcare CDN URLs — no need to proxy
                />
              </div>

              {/* Overlay controls */}
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-8 items-center justify-center rounded-full bg-white/90 text-foreground hover:bg-white"
                  title="View full size"
                >
                  <ExternalLink className="size-4" />
                </a>
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  disabled={isSaving}
                  className="flex size-8 items-center justify-center rounded-full bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-60"
                  title="Remove image"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {/* Image number badge */}
              <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                {i + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload widget */}
      <div className="relative">
        {isSaving && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        )}

        <div className="uc-uploader-wrapper rounded-lg border-2 border-dashed border-border/60 bg-muted/20 transition-colors hover:border-primary/40 hover:bg-muted/40">
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <ImageIcon className="size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              {existingUrls.length === 0 ? 'Add an image to this post' : 'Add more images'}
            </p>
            <p className="text-xs text-muted-foreground/60">
              Upload from your computer, URL, Unsplash, Google Drive, Dropbox, or Instagram
            </p>
          </div>

          <FileUploaderRegular
            pubkey={pubkey}
            // multiple={true}
            // imgOnly={true}
            multiple
            imgOnly
            useCloudImageEditor
            sourceList="local, url, camera, dropbox, gdrive, instagram"
            // useCloudImageEditor={true}
            onFileUploadSuccess={() => {
              // Called per file — batch them via onDoneClick
            }}
            onDoneClick={(files) => {
              const uploaded = files.allEntries
                .filter(f => f.status === 'success')
                .map(f => ({ cdnUrl: (f as any).cdnUrl as string | null }));
              handleUploadComplete(uploaded);
            }}
            classNameUploader="uc-light uc-dark:uc-dark"
            className="w-full"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {existingUrls.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {existingUrls.length === 1
            ? '1 image attached. This will be used when publishing.'
            : `${existingUrls.length} images attached. First image is used for single-image posts.`}
        </p>
      )}
    </div>
  );
}

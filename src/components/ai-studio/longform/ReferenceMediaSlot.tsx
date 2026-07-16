'use client';

// ReferenceMediaSlot — project-level "brand reference" image that is threaded
// into every keyframe generation. Users can pick from the Media Library or
// upload a fresh asset via Cloudinary; the URL is stored in project.metadata.

import { ImagePlus, Upload, X } from 'lucide-react';
import { CldUploadWidget } from 'next-cloudinary';
import { useState } from 'react';

import { MediaPickerModal } from '@/components/media/MediaPickerModal';

type Props = {
  imageUrl?: string;
  onChange: (url: string | undefined) => void;
  disabled?: boolean;
};

export function ReferenceMediaSlot({ imageUrl, onChange, disabled }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-muted-foreground uppercase tracking-wider">Reference Image</label>
      <p className="text-[10px] text-muted-foreground -mt-1">
        Optional. When set, every AI keyframe uses this image as a style anchor.
      </p>

      {imageUrl ? (
        <div className="relative rounded-md border bg-muted overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Project reference" className="w-full h-32 object-cover" />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            disabled={disabled}
            className="absolute top-1 right-1 rounded-full bg-background/70 p-1 text-foreground hover:bg-background transition-colors"
            title="Remove reference image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="absolute bottom-1 right-1 flex gap-1">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={disabled}
              className="rounded bg-background/70 px-2 py-0.5 text-[10px] text-foreground hover:bg-background transition-colors"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={disabled}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed bg-background px-2 py-2 text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Library
          </button>
          <CldUploadWidget
            signatureEndpoint="/api/media-library/signature"
            options={{
              multiple: false,
              maxFiles: 1,
              sources: ['local', 'url', 'camera'],
              resourceType: 'image',
              clientAllowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
            }}
            onSuccess={(result) => {
              const info = (result?.info ?? {}) as { secure_url?: string };
              if (info.secure_url) onChange(info.secure_url);
            }}
          >
            {({ open }) => (
              <button
                type="button"
                onClick={() => open?.()}
                disabled={disabled}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed bg-background px-2 py-2 text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
              </button>
            )}
          </CldUploadWidget>
        </div>
      )}

      {pickerOpen && (
        <MediaPickerModal
          open
          onClose={() => setPickerOpen(false)}
          mediaType="image"
          title="Select reference image"
          onSelect={(url) => {
            onChange(url);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

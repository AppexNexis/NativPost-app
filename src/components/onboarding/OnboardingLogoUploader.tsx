'use client';

/**
 * OnboardingLogoUploader
 *
 * Cloudinary-signed logo upload used by both onboarding wizards
 * (/onboarding/setup and /dashboard/brand-profile/onboarding).
 *
 * The wizard already stores the brand logo as a URL string on
 * brandProfile.logoUrl, so this component emits a full Cloudinary
 * delivery URL rather than the raw public_id. That keeps the server
 * contract unchanged while the browser side moves fully off Uploadcare.
 */

import { ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { CldImage, CldUploadWidget, type CloudinaryUploadWidgetOptions } from 'next-cloudinary';
import { useState } from 'react';

type OnboardingLogoUploaderProps = {
  value: string;
  onChange: (deliveryUrl: string) => void;
};

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || '';

function buildDeliveryUrl(publicId: string): string {
  if (!CLOUD_NAME) return '';
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/q_auto,f_auto/${publicId}`;
}

function isCloudinaryUrl(url: string): boolean {
  return /res\.cloudinary\.com\//i.test(url);
}

function publicIdFromUrl(url: string): string | null {
  const match = url.match(/\/upload\/(?:[^/]+\/)*([^./]+(?:\/[^./]+)*)(?:\.[a-z0-9]+)?$/i);
  return match?.[1] ?? null;
}

export function OnboardingLogoUploader({ value, onChange }: OnboardingLogoUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const widgetOptions: CloudinaryUploadWidgetOptions = {
    sources: ['local', 'url', 'camera'],
    multiple: false,
    resourceType: 'image',
    clientAllowedFormats: ['png', 'jpg', 'jpeg', 'webp', 'svg'],
    maxFileSize: 2_000_000,
    cropping: false,
    showSkipCropButton: true,
    styles: {
      palette: {
        window: '#FFFFFF',
        windowBorder: '#E5E7EB',
        tabIcon: '#864FFE',
        menuIcons: '#6B7280',
        textDark: '#111827',
        textLight: '#FFFFFF',
        link: '#864FFE',
        action: '#864FFE',
        inactiveTabIcon: '#9CA3AF',
        error: '#EF4444',
        inProgress: '#864FFE',
        complete: '#10B981',
        sourceBg: '#F9FAFB',
      },
    },
  };

  const previewPublicId = value && isCloudinaryUrl(value) ? publicIdFromUrl(value) : null;
  const hasLegacyPreview = !!value && !previewPublicId;

  return (
    <CldUploadWidget
      signatureEndpoint="/api/media-library/signature"
      options={widgetOptions}
      onOpen={() => setError(null)}
      onSuccess={(result) => {
        const info: any = (result as any)?.info;
        if (!info?.public_id) {
          setError('Upload finished but no file id was returned. Try again.');
          setIsUploading(false);
          return;
        }
        onChange(buildDeliveryUrl(info.public_id));
        setIsUploading(false);
      }}
      onError={(err) => {
        console.error('[OnboardingLogoUploader] Upload error:', err);
        setError('Upload failed. Please try again.');
        setIsUploading(false);
      }}
      onQueuesStart={() => setIsUploading(true)}
    >
      {({ open }) => (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => open()}
            className="group flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/40 dark:border-border/50 dark:bg-muted/10 dark:hover:border-primary/60 dark:hover:bg-muted/20"
          >
            {previewPublicId
              ? (
                  <div className="relative size-20 overflow-hidden rounded-lg ring-1 ring-border">
                    <CldImage
                      src={previewPublicId}
                      alt="Brand logo preview"
                      width={80}
                      height={80}
                      className="size-full object-contain"
                      quality="auto"
                      format="auto"
                    />
                  </div>
                )
              : hasLegacyPreview
                ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={value}
                      alt="Brand logo preview"
                      className="size-20 rounded-lg object-contain ring-1 ring-border"
                    />
                  )
                : (
                    <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                      {isUploading
                        ? <Loader2 className="size-6 animate-spin" />
                        : <ImagePlus className="size-6" />}
                    </div>
                  )}

            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {value ? 'Replace logo' : isUploading ? 'Uploading...' : 'Upload your logo'}
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, SVG, or WebP, up to 2MB
              </p>
            </div>

            {value && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                <RefreshCw className="size-3" />
                Click to replace
              </span>
            )}
          </button>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </CldUploadWidget>
  );
}

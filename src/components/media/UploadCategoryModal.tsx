// components/media/UploadCategoryModal.tsx
'use client';

import { useState } from 'react';

type PendingUpload = {
  publicId: string;
  resourceType: 'image' | 'video';
  thumbnailUrl: string;
  originalFilename: string;
};

type UploadCategoryModalProps = {
  upload: PendingUpload;
  isVideo: boolean;
  onConfirm: (categories: string[]) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
};

const SUGGESTED_CATEGORIES = [
  'Product',
  'Lifestyle',
  'Behind the Scenes',
  'Testimonial',
  'Promotion',
  'Team',
];

export function UploadCategoryModal({ upload, isVideo, onConfirm, onSkip }: UploadCategoryModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleCategory = (category: string) => {
    setSelected((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const addCustomCategory = () => {
    const value = customInput.trim();
    if (!value || selected.includes(value)) return;
    setSelected((prev) => [...prev, value]);
    setCustomInput('');
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    await onConfirm(selected);
    setIsSubmitting(false);
  };

  const handleSkip = async () => {
    setIsSubmitting(true);
    await onSkip();
    setIsSubmitting(false);
  };

  const customSelected = selected.filter((c) => !SUGGESTED_CATEGORIES.includes(c));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-lg">
        <div className="flex gap-3">
          <div className="size-16 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
            {isVideo ? (
              <video src={upload.thumbnailUrl} className="size-full object-cover" muted />
            ) : (
              <img src={upload.thumbnailUrl} alt={upload.originalFilename} className="size-full object-cover" />
            )}
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-sm font-medium">Tag this {isVideo ? 'video' : 'image'}</p>
            <p className="truncate text-xs text-muted-foreground">{upload.originalFilename}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {SUGGESTED_CATEGORIES.map((category) => {
            const isActive = selected.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomCategory();
              }
            }}
            placeholder="Add a category"
            className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={addCustomCategory}
            disabled={!customInput.trim()}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {customSelected.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {customSelected.map((category) => (
              <span
                key={category}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {category}
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="text-primary/60 hover:text-primary"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {selected.length > 0 ? `Save with ${selected.length} tag${selected.length > 1 ? 's' : ''}` : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
'use client';

import { ImagePlus, X } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

import { MediaPickerModal } from '@/components/media/MediaPickerModal';

interface ReferenceImageSlotProps {
  value?: string;
  onChange: (url: string | undefined) => void;
  label?: string;
}

export function ReferenceImageSlot({ value, onChange, label }: ReferenceImageSlotProps) {
  const [open, setOpen] = useState(false);

  if (value) {
    return (
      <div className="relative h-20 w-20 overflow-hidden rounded-md border border-border bg-muted">
        <Image src={value} alt={label ?? 'Reference'} fill className="object-cover" sizes="80px" />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
          aria-label="Remove reference"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-background text-muted-foreground transition hover:bg-muted"
      >
        <ImagePlus className="h-4 w-4" />
        <span className="text-[10px]">Reference</span>
      </button>
      <MediaPickerModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(url) => {
          onChange(url);
          setOpen(false);
        }}
        mediaType="image"
        title="Pick reference image"
      />
    </>
  );
}

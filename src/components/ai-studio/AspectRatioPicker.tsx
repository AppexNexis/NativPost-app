'use client';

import { cn } from '@/utils/Helpers';

export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5';

interface AspectRatioPickerProps {
  aspects: AspectRatio[];
  value: AspectRatio;
  onChange: (aspect: AspectRatio) => void;
}

export function AspectRatioPicker({ aspects, value, onChange }: AspectRatioPickerProps) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {aspects.map((aspect) => {
        const active = aspect === value;
        return (
          <button
            key={aspect}
            type="button"
            onClick={() => onChange(aspect)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition',
              active
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-foreground hover:bg-muted',
            )}
          >
            {aspect}
          </button>
        );
      })}
    </div>
  );
}

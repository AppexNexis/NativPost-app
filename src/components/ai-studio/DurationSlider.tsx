'use client';

import { cn } from '@/utils/Helpers';

interface DurationSliderProps {
  durations: number[];
  value: number;
  onChange: (seconds: number) => void;
}

export function DurationSlider({ durations, value, onChange }: DurationSliderProps) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {durations.map((sec) => {
        const active = sec === value;
        return (
          <button
            key={sec}
            type="button"
            onClick={() => onChange(sec)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition',
              active
                ? 'bg-primary text-primary-foreground'
                : 'bg-background text-foreground hover:bg-muted',
            )}
          >
            {sec}s
          </button>
        );
      })}
    </div>
  );
}

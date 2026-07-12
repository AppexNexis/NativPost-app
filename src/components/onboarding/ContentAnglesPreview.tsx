'use client';

/**
 * ContentAnglesPreview
 *
 * Shows the 5 auto-generated angles on the wizard's Done step with a
 * per-angle checkbox. Selected angles are persisted through
 * POST /api/content-angles by the parent on finish.
 */

import { Check } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/Helpers';

export type ContentAngleDraft = {
  name: string;
  description: string;
  targetAudience: string;
};

type ContentAnglesPreviewProps = {
  angles: ContentAngleDraft[];
  selected: string[];
  onToggle: (name: string) => void;
};

const CARD_COLORS = [
  'border-orange-200 bg-orange-50/60 dark:border-orange-900/60 dark:bg-orange-950/30',
  'border-blue-200 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/30',
  'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30',
  'border-violet-200 bg-violet-50/60 dark:border-violet-900/60 dark:bg-violet-950/30',
  'border-pink-200 bg-pink-50/60 dark:border-pink-900/60 dark:bg-pink-950/30',
];

export function ContentAnglesPreview({ angles, selected, onToggle }: ContentAnglesPreviewProps) {
  if (angles.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="size-3.5" />
        </div>
        <p className="text-sm font-medium text-foreground">
          {angles.length}
          {' '}
          content angles ready for your calendar
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        These are the durable themes we will draw from when generating posts. Uncheck any you would rather skip. You can add more from the dashboard later.
      </p>

      <div className="space-y-2.5">
        {angles.map((angle, i) => {
          const isSelected = selected.includes(angle.name);
          return (
            <label
              key={angle.name}
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border p-4 transition-all',
                CARD_COLORS[i % CARD_COLORS.length],
                isSelected ? 'ring-2 ring-primary/40' : 'opacity-70 hover:opacity-100',
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggle(angle.name)}
                className="mt-1"
              />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold text-foreground">{angle.name}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {angle.description}
                </p>
                {angle.targetAudience && (
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                    For:
                    {' '}
                    {angle.targetAudience}
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

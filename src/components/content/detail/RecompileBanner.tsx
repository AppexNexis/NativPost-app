'use client';

import { Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

type Props = {
  isRecompiling: boolean;
  percent: number;
  stage: 'rendering' | 'uploading';
  error: string | null;
  onRecompile: () => void;
};

export function RecompileBanner({ isRecompiling, percent, stage, error, onRecompile }: Props) {
  const label = isRecompiling
    ? stage === 'uploading' ? 'Uploading to Cloudinary…' : `Rendering video ${percent}%`
    : 'Compile standalone video';

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/20">
      <p className="text-xs text-amber-800 dark:text-amber-300">
        This video has no baked-in overlays. Preview is rendered live. Compile a standalone MP4 to enable downloads and social publishing with overlays.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onRecompile}
          disabled={isRecompiling}
          className="h-8 border-amber-300 bg-white text-amber-800 hover:bg-amber-100 dark:border-amber-800/50 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-900/30"
        >
          {isRecompiling
            ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            : <RefreshCw className="mr-1.5 size-3.5" />}
          {label}
        </Button>
        {isRecompiling && (
          <div className="flex-1 min-w-[120px]">
            <Progress
              value={stage === 'uploading' ? 100 : percent}
              className="h-1.5"
            />
          </div>
        )}
      </div>
      {error && (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

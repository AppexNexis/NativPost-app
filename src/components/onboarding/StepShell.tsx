'use client';

/**
 * Shared step primitives - heading, continue button, choice grid.
 * Extracted so each step file can stay focused on its content.
 */

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Helpers';

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function ContinueButton({
  onClick,
  disabled,
  isLoading,
  label = 'Continue',
}: {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  label?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      size="lg"
      className="w-full rounded-full"
    >
      {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
      {isLoading ? 'Saving...' : label}
    </Button>
  );
}

export function ChoiceGrid({
  options,
  selected,
  onSelect,
  multi,
  columns = 2,
}: {
  options: string[];
  selected: string | string[];
  onSelect: (value: string) => void;
  multi?: boolean;
  columns?: 2 | 3;
}) {
  const isSelected = (opt: string) => multi ? (selected as string[]).includes(opt) : selected === opt;

  return (
    <div className={cn('grid gap-2.5', columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')}>
      {options.map((opt) => {
        const active = isSelected(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            className={cn(
              'rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all',
              active
                ? 'border-primary bg-primary/10 text-primary shadow-sm ring-2 ring-primary/20 dark:bg-primary/15'
                : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/40 dark:hover:bg-muted/20',
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

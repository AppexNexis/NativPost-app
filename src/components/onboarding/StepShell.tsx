'use client';

/**
 * Shared step primitives — heading, continue button, choice grid, and the
 * completion check. Extracted so each step file can stay focused on its
 * content. Motion here is purposeful: selection feedback and the success
 * moment; everything collapses under prefers-reduced-motion.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Helpers';

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-title text-foreground">{title}</h1>
      {subtitle && <p className="mt-1.5 text-body text-muted-foreground">{subtitle}</p>}
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
      className="w-full rounded-full transition-transform duration-instant active:scale-[0.99]"
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
    <div
      className={cn('grid gap-2.5', columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')}
      role={multi ? 'group' : 'radiogroup'}
    >
      {options.map((opt) => {
        const active = isSelected(opt);
        return (
          <button
            key={opt}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={active}
            onClick={() => onSelect(opt)}
            className={cn(
              'flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all duration-instant active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary bg-primary/10 text-primary shadow-sm ring-2 ring-primary/20 dark:bg-primary/15'
                : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/40 dark:hover:bg-muted/20',
            )}
          >
            <span className="min-w-0 truncate">{opt}</span>
            <Check
              aria-hidden
              className={cn(
                'size-4 shrink-0 transition-all duration-fast ease-out-quart',
                active ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Completion moment — a circle that draws itself, then the check strokes in.
 * Reduced-motion users see the finished mark immediately.
 */
export function SuccessCheck() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
      className="mb-5 flex size-14 items-center justify-center rounded-full bg-emerald-500/10"
      aria-hidden
    >
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" className="text-emerald-500">
        <motion.circle
          cx="15"
          cy="15"
          r="13"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
        <motion.path
          d="M9 15.5l4 4 8-8.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
        />
      </svg>
    </motion.div>
  );
}

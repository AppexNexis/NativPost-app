'use client';

/**
 * OnboardingShell
 *
 * Split-column layout for the onboarding wizard. Left column is a dark
 * hero panel mirroring the sign-in screen. Right column hosts the step
 * card. Progress pills sit under the card, an optional Back link under
 * that. Fully dark-mode aware.
 */

import Image from 'next/image';

import { cn } from '@/utils/Helpers';

type OnboardingShellProps = {
  totalSteps: number;
  stepIndex: number;
  onBack?: () => void;
  showBack?: boolean;
  children: React.ReactNode;
};

export function OnboardingShell({
  totalSteps,
  stepIndex,
  onBack,
  showBack,
  children,
}: OnboardingShellProps) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-2">
      {/* Left brand column */}
      <aside className="relative hidden overflow-hidden bg-neutral-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-10 dark:bg-neutral-950">
        <div className="flex items-center gap-2">
          <Image
            src="/assets/images/shared/main-logo-dark.svg"
            alt="NativPost"
            width={140}
            height={32}
            priority
            className="brightness-0 invert"
          />
        </div>

        <div className="max-w-md space-y-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
            Set up your brand voice
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
            Your brand,
            <br />
            everywhere,
            <br />
            on autopilot.
          </h2>
          <p className="text-sm leading-relaxed text-white/60">
            A few quick questions so we can generate content that actually sounds like you. You can edit anything later in Brand Profile.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-6 text-xs text-white/60">
          <div>
            <p className="text-lg font-semibold text-white">9+</p>
            <p>Social platforms</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-white">7 days</p>
            <p>Free trial</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-white">$0</p>
            <p>Due today</p>
          </div>
        </div>
      </aside>

      {/* Right wizard column */}
      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-lg">
          {/* Mobile-only logo */}
          <div className="mb-6 flex justify-center lg:hidden">
            <Image
              src="/assets/images/shared/main-logo-dark.svg"
              alt="NativPost"
              width={128}
              height={28}
              priority
              className="dark:brightness-0 dark:invert"
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            {children}
          </div>

          <div className="mt-6 flex items-center justify-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={stepIndex + 1}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === stepIndex
                    ? 'w-8 bg-primary'
                    : i < stepIndex
                      ? 'w-1.5 bg-primary/50 dark:bg-primary/70'
                      : 'w-1.5 bg-muted-foreground/20 dark:bg-muted-foreground/30',
                )}
              />
            ))}
          </div>

          {showBack && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mx-auto mt-5 block text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Back
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

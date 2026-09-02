'use client';

import { ReactNode } from 'react';

// ─── Factory Page Shell ──────────────────────────────────────────────────────

/**
 * Shared layout shell for all Content Factory pages.
 *
 * Provides consistent spacing, max-width, and visual rhythm.
 */
export function FactoryPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="px-5 py-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {children}
      </div>
    </main>
  );
}

// ─── Factory Page Header ─────────────────────────────────────────────────────

/**
 * Consistent header for all Content Factory pages.
 */
export function FactoryPageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

// ─── Factory Section ─────────────────────────────────────────────────────────

/**
 * Consistent section wrapper for content blocks.
 */
export function FactorySection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

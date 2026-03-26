// src/app/[locale]/(auth)/dashboard/brand-profile/onboarding/layout.tsx
//
// nuqs requires a NuqsAdapter at or above the component that calls useQueryState.
// Since this is Next.js App Router, we wrap the onboarding route in its own
// layout with the adapter so useQueryState works correctly.

import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <NuqsAdapter>{children}</NuqsAdapter>;
}
